// 咩咩学 · iPad 自编译原生壳（Swift Playgrounds 版）
//
// 用途：没有 Mac 也能在 iPad/iPhone 上跑一个真正的原生壳，验证 WKWebView 里的实际表现。
// 用法：
//   1. App Store 装「Swift Playgrounds」（免费，需 iPadOS 16+ / iOS 16+）
//   2. 新建 → App 模板
//   3. 把本项目里所有 .swift 文件内容替换成下面这份（或只把 ContentView 部分换掉）
//   4. 点「运行」，App 会以全屏形式在本机启动
//
// 注意：
//   - 加载的是已发布的在线地址，所以设备要联网
//   - 这条路径只能验证「H5 在原生 WKWebView 里的表现」，
//     工程里的 iCloud 桥接、触控反馈等原生代码不在其中
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
            .ignoresSafeArea(.container, edges: .top)   // 顶部贴到状态栏下
            .ignoresSafeArea(.container, edges: .bottom)
    }
}

@main
struct MieMieLearnApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.light)   // 儿童应用固定浅色，避免深色模式反色
        }
    }
}
