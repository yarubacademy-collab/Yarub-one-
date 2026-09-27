package one.yarub.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import java.net.URI

/**
 * The Android client.
 *
 * It shares the web application's session, routes and AI Core rather than
 * duplicating them — one backend, two front ends, as the architecture requires.
 * Navigation is confined to the configured backend origin, so a link in
 * generated content cannot turn the app into a general-purpose browser.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    // A WebView permission request left waiting on the OS-level runtime
    // permission dialog. There is at most one at a time — the page cannot
    // ask again until this one resolves.
    private var pendingMicRequest: PermissionRequest? = null

    private val micPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        val request = pendingMicRequest
        pendingMicRequest = null
        if (request == null) return@registerForActivityResult
        if (granted) {
            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
        } else {
            request.deny()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setTheme(R.style.Theme_YarubOne)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // No file or content access: the app never needs to read local
            // files, and denying it removes a whole class of exfiltration.
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
        }

        // Session cookies are how the app authenticates, matching the web app.
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val target = request.url.toString()
                return if (isBackendOrigin(target)) {
                    false
                } else {
                    // Anything off-origin is not ours to render in-app.
                    true
                }
            }

            override fun onPageFinished(view: WebView, url: String) {
                findViewById<View>(R.id.splash)?.visibility = View.GONE
            }
        }

        // Voice input needs the microphone, and only for the backend's own
        // origin — nothing else the WebView could ever load should be able
        // to ask for it.
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val wantsMic = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                if (!wantsMic || !isBackendOrigin(request.origin.toString())) {
                    request.deny()
                    return
                }

                val alreadyGranted = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.RECORD_AUDIO,
                ) == PackageManager.PERMISSION_GRANTED

                if (alreadyGranted) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                } else {
                    pendingMicRequest = request
                    micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState == null) {
            webView.loadUrl(ApiConfig.baseUrl)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    private fun isBackendOrigin(url: String): Boolean = runCatching {
        val target = URI(url)
        val base = URI(ApiConfig.baseUrl)
        target.host != null && target.host.equals(base.host, ignoreCase = true)
    }.getOrDefault(false)

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }
}
