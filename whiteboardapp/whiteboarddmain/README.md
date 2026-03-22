# Whiteboard

A tiny iOS app that wraps the hosted Whiteboard web experience in a native SwiftUI shell.

## What it does

This app loads `https://hackduke26stu.vercel.app/` inside a `WKWebView` and presents it full-screen.

### Current behavior
- Launches directly into the hosted whiteboard site
- Shows a loading spinner while the page is loading
- Hides the status bar and other system overlays for a more immersive experience
- Disables web view bounce and scrolling in the native container

## Tech stack

- SwiftUI
- WebKit (`WKWebView`)
- XCTest-style project structure with the newer `Testing` package for unit tests

## Project structure

```text
whiteboarddmain/
├── README.md
├── Whiteboard/
│   ├── WhiteboardApp.swift      # App entry point
│   ├── ContentView.swift        # Main screen and loading state
│   └── Views/
│       └── WebView.swift        # SwiftUI wrapper around WKWebView
├── WhiteboardTests/
└── WhiteboardUITests/
```

## How it works

### `WhiteboardApp.swift`
Starts the app and renders `ContentView` in the main window.

### `ContentView.swift`
- Owns the `isLoading` state
- Renders the full-screen `WebView`
- Displays a white loading overlay with a spinner until the web page finishes loading

### `Views/WebView.swift`
- Bridges `WKWebView` into SwiftUI using `UIViewRepresentable`
- Loads the hosted URL with `URLRequest`
- Uses a coordinator as `WKNavigationDelegate`
- Updates the SwiftUI loading state when navigation starts, finishes, or fails

## Requirements

- Xcode with SwiftUI and iOS SDK support
- An internet connection
- The hosted app at `https://hackduke26stu.vercel.app/` must be available

## Running the app

1. Open the Xcode project or workspace for this app.
2. Choose an iPhone simulator or device.
3. Build and run.

If the remote site is reachable, the whiteboard experience will load automatically.

## Notes and limitations

- This app is currently a thin web wrapper, not a fully native whiteboard implementation.
- If the hosted URL changes or goes down, the app will not function correctly.
- There is no custom offline mode or native error UI yet.
- `updateUIView` is intentionally empty because the current implementation loads a fixed URL once.

## Possible next improvements

- Add a friendly error screen when the web page fails to load
- Support pull-to-refresh or manual reload
- Externalize the base URL into configuration
- Add tests around loading-state behavior
- Add app branding, icon, and launch screen polish

## Summary

This project keeps things simple on purpose: one SwiftUI screen, one wrapped web view, one remote whiteboard app. Very YAGNI. Very little nonsense. Love that for it.
