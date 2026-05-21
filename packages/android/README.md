# notes-android

Placeholder for the Android client. The Gradle project, app sources, and a
`gradlew` wrapper land in M06 (Editor) and M07 (Attachment pipeline). M14
seeds this folder so the release pipeline (`build-apk.yml`) can reference a
stable path.

Until then `build-apk.yml` is gated on `v*` tags only and on the presence of
`gradlew`, so the workflow stays green on routine pushes.
