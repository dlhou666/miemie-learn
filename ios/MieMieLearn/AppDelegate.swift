//
//  AppDelegate.swift
//  咩咩学 · iPad 学习激励系统
//
//  原生壳入口：创建一个全屏 WKWebView 容器，加载 Bundle 内的 Web/index.html。
//  设计稿为 820 × 1180 iPad 竖屏，原生层不做任何缩放，交由 CSS 安全区适配。
//

import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {

        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = UIColor(red: 0.06, green: 0.09, blue: 0.13, alpha: 1.0) // #0F1720
        window.rootViewController = ViewController()
        window.makeKeyAndVisible()
        self.window = window

        return true
    }

    // iPad 上允许四个方向，配合设计稿的竖屏布局由 CSS 处理横向时的安全区
    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        return .all
    }
}
