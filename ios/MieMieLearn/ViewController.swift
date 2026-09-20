//
//  ViewController.swift
//  咩咩学 · iPad 学习激励系统
//
//  职责：
//   1. WKWebView 全屏承载设计稿还原的 H5 应用（离线加载 Bundle 内资源）
//   2. 自签 TLS 证书信任：以 Bundle 内 dev-ca.der 作为唯一信任锚（证书固定）
//   3. JS Bridge：向 H5 提供触感反馈等原生能力
//

import UIKit
import WebKit

final class ViewController: UIViewController {

    // MARK: - 常量

    private let jsHandlerName = "native"
    private let hapticHandlerName = "haptic"
    private let cloudHandlerName = "icloud"
    private let webDirectory  = "Web"
    private let entryPage     = "index.html"
    private let cloudKey      = "miemie.state"   // NSUbiquitousKeyValueStore 键

    private var webView: WKWebView!

    // MARK: - 外观

    // 设计稿自带状态栏（页面内绘制），隐藏系统状态栏以保证 1:1 还原
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    // MARK: - 生命周期

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.06, green: 0.09, blue: 0.13, alpha: 1.0)
        configureWebView()
        loadEntryPage()
    }

    // MARK: - WKWebView

    private func configureWebView() {
        let controller = WKUserContentController()
        let bridge = MessageBridge(vc: self)
        controller.add(bridge, name: jsHandlerName)
        controller.add(bridge, name: hapticHandlerName)   // H5 按钮触感反馈
        controller.add(bridge, name: cloudHandlerName)    // H5 数据 → iCloud 键值存储

        // 注入标记，供 H5 判定运行于原生壳内（自动启用 iOS 安全区布局）
        let script = WKUserScript(
            source: "window.__NATIVE_SHELL__ = true;",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        controller.addUserScript(script)

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.allowsInlineMediaPlayback = true
        // 仅内存缓存，避免离线场景下磁盘缓存脏数据
        config.websiteDataStore = .default()

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate  = self
        webView.uiDelegate          = self
        webView.scrollView.bounces  = false                 // 禁用橡皮筋回弹
        webView.scrollView.isScrollEnabled = false          // 页面内部自滚动
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.06, green: 0.09, blue: 0.13, alpha: 1.0)

        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        // 铺满整个屏幕（含安全区），由 H5 内部处理 env(safe-area-inset-*)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }

    private func loadEntryPage() {
        guard
            let root = Bundle.main.resourceURL?.appendingPathComponent(webDirectory),
            let page = Bundle.main.url(forResource: entryPage, withExtension: nil, subdirectory: webDirectory)
        else {
            showLoadFailure(reason: "Bundle 内未找到 \(webDirectory)/\(entryPage)，请先执行 scripts/sync-web.sh")
            return
        }
        // allowingReadAccessTo 授予整个 Web 目录读权限，相对路径 assets/*.png 才能加载
        webView.loadFileURL(page, allowingReadAccessTo: root)
    }

    private func showLoadFailure(reason: String) {
        let label = UILabel()
        label.text = "资源加载失败\n\(reason)"
        label.numberOfLines = 0
        label.textAlignment = .center
        label.textColor = .white
        label.font = .systemFont(ofSize: 17, weight: .medium)
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 40),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -40)
        ])
    }

    // MARK: - 供 JS Bridge 调用

    fileprivate func handle(message: [String: Any], from handler: String) {
        if let action = message["action"] as? String {
            switch action {
            case "haptic":
                Haptic.play(message["type"] as? String ?? "light")
            case "log":
                #if DEBUG
                print("[H5] \(message["msg"] ?? "")")
                #endif
            default:
                break
            }
            return
        }
        switch handler {
        case hapticHandlerName:
            Haptic.play(message["style"] as? String ?? "light")
        case cloudHandlerName:
            guard let op = message["op"] as? String else { return }
            switch op {
            case "save":
                guard let payload = message["payload"] as? String else { return }
                CloudSync.save(payload, key: cloudKey)
            case "load":
                pullFromCloud()
            default:
                break
            }
        default:
            break
        }
    }

    /// 启动时把 iCloud 上的快照合并回本地 H5（合并策略：取并集 / 较大值）
    private func pullFromCloud() {
        guard let snapshot = CloudSync.load(key: cloudKey) else { return }
        let escaped = snapshot
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
        let js = "if (window.MMCloudRestore) { window.MMCloudRestore('\(escaped)'); }"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }
}

// MARK: - WKScriptMessageHandler（避免 WKWebView 持有 VC 造成循环引用）

private final class MessageBridge: NSObject, WKScriptMessageHandler {
    weak var vc: ViewController?
    init(vc: ViewController) { self.vc = vc; super.init() }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        DispatchQueue.main.async { self.vc?.handle(message: body, from: message.name) }
    }
}

// MARK: - iCloud 键值同步（需 Signing & Capabilities 勾选 iCloud → Key-value storage）

private enum CloudSync {
    static func save(_ payload: String, key: String) {
        NSUbiquitousKeyValueStore.default.set(payload, forKey: key)
        NSUbiquitousKeyValueStore.default.synchronize()
    }
    static func load(key: String) -> String? {
        NSUbiquitousKeyValueStore.default.synchronize()
        return NSUbiquitousKeyValueStore.default.string(forKey: key)
    }
}

// MARK: - 触感反馈

private enum Haptic {
    static func play(_ style: String) {
        switch style {
        case "success":
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warning":
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case "heavy":
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        case "medium":
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        default:
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }
}

// MARK: - WKNavigationDelegate：自签证书信任 + 失败兜底

extension ViewController: WKNavigationDelegate {

    /// 只信任 Bundle 内的自签根证书 dev-ca.der（证书固定）。
    /// 若未内置该证书，则回退系统校验 —— 生产环境请保留内置 CA。
    func webView(_ webView: WKWebView,
                 didReceive challenge: URLAuthenticationChallenge,
                 completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {

        let method = challenge.protectionSpace.authenticationMethod
        guard method == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        if trustAnchorMatches(trust) {
            completionHandler(.useCredential, URLCredential(trust: trust))
        } else {
            completionHandler(.performDefaultHandling, nil)
        }
    }

    private func trustAnchorMatches(_ trust: SecTrust) -> Bool {
        // 优先使用内置自签 CA 作为唯一信任锚
        if let caURL = Bundle.main.url(forResource: "dev-ca",
                                       withExtension: "der",
                                       subdirectory: "\(webDirectory)/certs"),
           let data = try? Data(contentsOf: caURL),
           let ca = SecCertificateCreateWithData(nil, data as CFData) {

            SecTrustSetAnchorCertificates(trust, [ca] as CFArray)
            SecTrustSetAnchorCertificatesOnly(trust, true)   // 仅信任内置 CA
            var error: CFError?
            return SecTrustEvaluateWithError(trust, &error)
        }
        // 未内置 CA：交由系统校验（公网正式证书场景）
        var error: CFError?
        return SecTrustEvaluateWithError(trust, &error)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        #if DEBUG
        print("[咩咩学] 页面加载完成")
        #endif
        // 页面就绪后合并云端快照（无 iCloud 权限时自动跳过）
        pullFromCloud()
    }

    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        showLoadFailure(reason: error.localizedDescription)
    }
}

// MARK: - WKUIDelegate：阻止意外弹窗，保持儿童应用的纯净体验

extension ViewController: WKUIDelegate {
    func webView(_ webView: WKWebView,
                 runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        completionHandler()
    }

    func webView(_ webView: WKWebView,
                 runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        completionHandler(false)
    }
}
