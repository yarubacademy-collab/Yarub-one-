package one.yarub.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import one.yarub.app.ApiConfig
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * The native API client.
 *
 * This is a real client against the same YARUB ONE backend the web app uses —
 * same routes, same session cookie, same AI Core. There is no second AI system
 * and no provider key anywhere in this package: an installed APK is
 * world-readable, so a key shipped here would be a published key.
 */
class YarubApi(private val session: SessionStore) {

    /**
     * `T` is covariant (`out`) on purpose. A failure carries no value, so
     * [errorFrom] produces a `Result<Nothing>`; without `out` that failure is
     * not assignable to `Result<JSONObject>` or `Result<ChatOutcome>` and every
     * error path in this file fails to compile. Covariance is sound here
     * because `T` never appears in an input position on this class.
     */
    data class Result<out T>(val value: T?, val errorCode: String?, val message: String?) {
        val isSuccess: Boolean get() = value != null
    }

    suspend fun login(email: String, password: String): Result<Unit> =
        postJson("/api/auth/login", JSONObject().put("email", email).put("password", password))
            .map { Unit }

    suspend fun register(email: String, password: String, locale: String): Result<Unit> =
        postJson(
            "/api/auth/register",
            JSONObject().put("email", email).put("password", password).put("locale", locale)
        ).map { Unit }

    suspend fun logout(): Result<Unit> {
        val result = postJson("/api/auth/logout", JSONObject()).map { Unit }
        session.clear()
        return result
    }

    suspend fun projects(): Result<List<Project>> =
        getJson("/api/projects").map { body ->
            val array = body.optJSONArray("projects") ?: JSONArray()
            (0 until array.length()).map { index ->
                val row = array.getJSONObject(index)
                Project(
                    id = row.getString("id"),
                    title = row.getString("title"),
                    domain = row.optString("domain"),
                    language = row.optString("language", "ar")
                )
            }
        }

    suspend fun entitlements(): Result<Entitlements> =
        getJson("/api/entitlements").map { body ->
            val allowance = body.optJSONArray("allowance") ?: JSONArray()
            Entitlements(
                planCode = body.optString("planCode", "free"),
                allowance = (0 until allowance.length()).map { index ->
                    val row = allowance.getJSONObject(index)
                    Allowance(
                        action = row.getString("action"),
                        used = row.getInt("used"),
                        limit = row.getInt("limit"),
                        remaining = row.getInt("remaining")
                    )
                }
            )
        }

    suspend fun capabilities(): Result<Map<String, String>> =
        getJson("/api/capabilities").map { body ->
            val array = body.optJSONArray("capabilities") ?: JSONArray()
            (0 until array.length()).associate { index ->
                val row = array.getJSONObject(index)
                row.getString("capability") to row.getString("status")
            }
        }

    /**
     * Sends a message and streams the reply.
     *
     * The response may instead be a plan (a complex request became a project) or
     * a clarifying question — the server decides, exactly as on the web, so the
     * two clients never diverge in behaviour.
     */
    suspend fun chat(
        message: String,
        locale: String,
        conversationId: String?,
        onDelta: (String) -> Unit
    ): Result<ChatOutcome> = withContext(Dispatchers.IO) {
        val payload = JSONObject()
            .put("message", message)
            .put("locale", locale)
        if (conversationId != null) payload.put("conversationId", conversationId)

        val connection = open("/api/chat/stream", "POST")
        try {
            connection.outputStream.use { it.write(payload.toString().toByteArray()) }

            val code = connection.responseCode
            if (code >= 400) return@withContext errorFrom(connection)

            val contentType = connection.contentType ?: ""
            if (!contentType.contains("event-stream")) {
                val body = JSONObject(connection.inputStream.bufferedReader().readText())
                return@withContext when (body.optString("kind")) {
                    "clarify" -> Result(ChatOutcome.Clarify(body.optString("question")), null, null)
                    "project" -> Result(ChatOutcome.Project(body.optString("jobId")), null, null)
                    else -> Result(ChatOutcome.Answer(""), null, null)
                }
            }

            val builder = StringBuilder()
            connection.inputStream.bufferedReader().use { reader: BufferedReader ->
                reader.lineSequence().forEach { line ->
                    if (!line.startsWith("data:")) return@forEach
                    val data = line.removePrefix("data:").trim()
                    if (data == "[DONE]") return@forEach
                    val delta = JSONObject(data).optString("delta")
                    if (delta.isNotEmpty()) {
                        builder.append(delta)
                        onDelta(delta)
                    }
                }
            }
            Result(ChatOutcome.Answer(builder.toString()), null, null)
        } catch (error: Exception) {
            Result(null, "NETWORK", error.message)
        } finally {
            connection.disconnect()
        }
    }

    // --- plumbing ---

    private fun open(path: String, method: String): HttpURLConnection {
        val connection = URL(ApiConfig.url(path)).openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 15_000
        connection.readTimeout = 120_000
        connection.setRequestProperty("Content-Type", "application/json")
        connection.setRequestProperty("Accept", "application/json, text/event-stream")
        session.cookie()?.let { connection.setRequestProperty("Cookie", it) }
        if (method == "POST" || method == "PATCH") connection.doOutput = true
        return connection
    }

    private suspend fun getJson(path: String): Result<JSONObject> = withContext(Dispatchers.IO) {
        val connection = open(path, "GET")
        try {
            if (connection.responseCode >= 400) return@withContext errorFrom(connection)
            captureSession(connection)
            Result(JSONObject(connection.inputStream.bufferedReader().readText()), null, null)
        } catch (error: Exception) {
            Result(null, "NETWORK", error.message)
        } finally {
            connection.disconnect()
        }
    }

    private suspend fun postJson(path: String, body: JSONObject): Result<JSONObject> =
        withContext(Dispatchers.IO) {
            val connection = open(path, "POST")
            try {
                connection.outputStream.use { it.write(body.toString().toByteArray()) }
                if (connection.responseCode >= 400) return@withContext errorFrom(connection)
                captureSession(connection)
                val text = connection.inputStream.bufferedReader().readText()
                Result(if (text.isBlank()) JSONObject() else JSONObject(text), null, null)
            } catch (error: Exception) {
                Result(null, "NETWORK", error.message)
            } finally {
                connection.disconnect()
            }
        }

    /** The session cookie is httpOnly on the wire and stored encrypted on device. */
    private fun captureSession(connection: HttpURLConnection) {
        connection.headerFields["Set-Cookie"]?.forEach { header ->
            if (header.startsWith("yarub_session=")) {
                session.save(header.substringBefore(';'))
            }
        }
    }

    /**
     * Server errors are already safe, localized strings — the backend never
     * sends internals — so they are surfaced as-is rather than reinterpreted.
     */
    private fun errorFrom(connection: HttpURLConnection): Result<Nothing> = try {
        val text = connection.errorStream?.bufferedReader()?.readText().orEmpty()
        val body = if (text.isBlank()) JSONObject() else JSONObject(text)
        Result(null, body.optString("code", "ERROR"), body.optString("message"))
    } catch (_: Exception) {
        Result(null, "ERROR", null)
    }

    private fun <T, R> Result<T>.map(transform: (T) -> R): Result<R> =
        if (value != null) Result(transform(value), null, null) else Result(null, errorCode, message)
}

data class Project(val id: String, val title: String, val domain: String, val language: String)
data class Allowance(val action: String, val used: Int, val limit: Int, val remaining: Int)
data class Entitlements(val planCode: String, val allowance: List<Allowance>)

sealed interface ChatOutcome {
    data class Answer(val text: String) : ChatOutcome
    data class Clarify(val question: String) : ChatOutcome
    data class Project(val jobId: String) : ChatOutcome
}
