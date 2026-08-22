package one.yarub.app

/**
 * Backend configuration.
 *
 * The app holds exactly one address: the YARUB ONE backend. It contains no
 * provider API key of any kind — an Android package is world-readable once
 * installed, so a key shipped here is a published key. All AI calls happen
 * server-side behind the same authentication the web app uses.
 */
object ApiConfig {
    val baseUrl: String = BuildConfig.API_BASE_URL

    fun url(path: String): String = baseUrl.trimEnd('/') + "/" + path.trimStart('/')
}
