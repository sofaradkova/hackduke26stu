import SwiftUI

struct ContentView: View {
    @State private var isLoading: Bool = true

    var body: some View {
        ZStack {
            WebView(
                url: URL(string: "https://hackduke26stu.vercel.app/")!,
                isLoading: $isLoading
            )
            .ignoresSafeArea()

            if isLoading {
                Color.white
                    .ignoresSafeArea()
                    .overlay {
                        ProgressView()
                            .controlSize(.large)
                            .tint(.gray)
                    }
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.3), value: isLoading)
        .persistentSystemOverlays(.hidden)
    }
}
