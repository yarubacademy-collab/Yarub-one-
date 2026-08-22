package one.yarub.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import one.yarub.app.data.ChatOutcome
import one.yarub.app.data.Entitlements
import one.yarub.app.data.YarubApi

data class ChatMessage(val role: String, val text: String)

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val streaming: String = "",
    val busy: Boolean = false,
    val error: String? = null,
    val quotaExceeded: Boolean = false,
    val entitlements: Entitlements? = null
)

/**
 * Chat state.
 *
 * The client renders whatever the server decides — an answer, a clarifying
 * question, or a project that has been queued. It never classifies the request
 * itself, which is what keeps Android and web behaviour identical.
 */
class ChatViewModel(private val api: YarubApi, private val locale: String) : ViewModel() {

    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state

    fun refreshEntitlements() {
        viewModelScope.launch {
            val result = api.entitlements()
            if (result.isSuccess) _state.value = _state.value.copy(entitlements = result.value)
        }
    }

    fun send(text: String, conversationId: String? = null) {
        if (text.isBlank() || _state.value.busy) return

        _state.value = _state.value.copy(
            messages = _state.value.messages + ChatMessage("user", text),
            busy = true,
            error = null,
            quotaExceeded = false,
            streaming = ""
        )

        viewModelScope.launch {
            val result = api.chat(text, locale, conversationId) { delta ->
                _state.value = _state.value.copy(streaming = _state.value.streaming + delta)
            }

            val current = _state.value
            when {
                result.errorCode == "QUOTA_EXCEEDED" ->
                    // A quota is a product boundary, not an error: the UI shows
                    // an upgrade path rather than a failure.
                    _state.value = current.copy(busy = false, quotaExceeded = true, streaming = "")

                !result.isSuccess ->
                    _state.value = current.copy(busy = false, error = result.message, streaming = "")

                else -> {
                    val reply = when (val outcome = result.value) {
                        is ChatOutcome.Answer -> outcome.text
                        is ChatOutcome.Clarify -> outcome.question
                        is ChatOutcome.Project -> ""
                        null -> ""
                    }
                    _state.value = current.copy(
                        messages = current.messages + ChatMessage("assistant", reply),
                        busy = false,
                        streaming = ""
                    )
                }
            }

            withContext(Dispatchers.Main) { refreshEntitlements() }
        }
    }
}
