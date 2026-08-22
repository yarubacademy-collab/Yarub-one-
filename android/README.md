# YARUB ONE — Android

A thin client over the same YARUB ONE backend the web app uses. One AI Core,
one authentication system, one set of APIs.

```
Web  ─┐
      ├── YARUB ONE backend → AI Core → providers
Android ─┘
```

## What this project deliberately does not contain

No provider API keys. An installed APK is world-readable, so a key shipped
inside it is a published key. Every AI call happens server-side behind the same
session authentication the web app uses.

## Configuration

Set the backend address in `gradle.properties`:

```
YARUB_API_BASE_URL_DEBUG=http://10.0.2.2:3000     # emulator → host machine
YARUB_API_BASE_URL_RELEASE=https://your-domain
```

Navigation is restricted to that origin, so a link inside generated content
cannot turn the app into a general-purpose browser.

## Languages

Arabic, Urdu and English ship as app resources; RTL is enabled via
`android:supportsRtl` and the web layer already mirrors correctly.

## Building

```bash
./gradlew :app:assembleDebug          # APK for testing
./gradlew :app:bundleRelease          # AAB for Google Play
```

**No signed build exists.** Release signing needs a keystore the owner holds,
and no `signingConfig` is declared, so a release build fails rather than
producing something that looks shippable and is not. To sign, add a keystore
and a `signingConfigs` block referencing credentials from `local.properties` —
never commit either.

## Placeholders to replace before release

- `app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` and its foreground vector
- `YARUB_API_BASE_URL_RELEASE`
