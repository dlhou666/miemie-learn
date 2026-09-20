// ============================================================
// 咩咩学 · iPad 自编译原生壳 —— Swift Playgrounds 版
// ============================================================
//
// 【推荐用法：只替换 ContentView.swift】
//   1. iPad 装 Swift Playgrounds（App Store 免费，需 iPadOS 16+）
//   2. 新建 → App 模板（会生成 MyApp.swift + ContentView.swift 两个文件）
//   3. MyApp.swift —— 不要动，保留模板自带的 @main
//   4. ContentView.swift —— 把里面全部内容删掉，替换成下面这一整段
//   5. 点运行 → App 全屏在本机启动
//
// 【备用】如果模板里没有 MyApp.swift，就把本文件末尾「完整版」那段也一起拷进去。
//
// 注意：加载的是已发布的在线地址，设备需要联网。
//       这条路径验证的是 H5 在真机 WKWebView 里的表现，
//       工程里的 iCloud 桥接、触控反馈等原生代码不在其中。
//
import SwiftUI
import WebKit

struct MieWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = false   // 禁掉左右滑动返回
        webView.scrollView.bounces = false                    // 禁掉橡皮筋回弹
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.93, green: 0.96, blue: 0.99, alpha: 1)
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct ContentView: View {
    var body: some View {
        MieWebView(url: URL(string: "https://miemie-learn.app.workbuddy.host/")!)
            .ignoresSafeArea(.container, edges: .top)      // 顶部贴到状态栏
            .ignoresSafeArea(.container, edges: .bottom)
            .preferredColorScheme(.light)                  // 固定浅色，避免深色模式反色
    }
}

// ============================================================
// 完整版（仅当模板没有自动生成 @main 时才需要）
// ============================================================
//
// import SwiftUI
//
// @main
// struct MieMieLearnApp: App {
//     var body: some Scene {
//         WindowGroup {
//             ContentView()
//         }
//     }
// }
//
