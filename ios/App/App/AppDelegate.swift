import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    /// Opaque cover shown over the UI while the app is backgrounded.
    ///
    /// iOS screenshots the app when it moves to the background and shows that
    /// image in the app switcher. For a finance app that means account balances
    /// and transaction history sit in the switcher — and in the snapshot iOS
    /// writes to disk — for anyone who picks up the device.
    ///
    /// This is the counterpart to FLAG_SECURE on Android (set in MainActivity).
    /// iOS has no equivalent flag, so the standard approach is to cover the
    /// window before the snapshot is taken and uncover once the app is active.
    private var privacyCover: UIView?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Cover the UI *before* iOS takes its app-switcher snapshot. This fires
        // ahead of the snapshot; applicationDidEnterBackground does not.
        guard let window = window, privacyCover == nil else { return }

        let cover = UIView(frame: window.bounds)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.backgroundColor = UIColor(red: 0.145, green: 0.388, blue: 0.922, alpha: 1.0) // #2563EB, matches the splash
        cover.isUserInteractionEnabled = false

        window.addSubview(cover)
        privacyCover = cover
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Remove the privacy cover added in applicationWillResignActive. Done here
        // rather than in willEnterForeground so it also clears after a transient
        // interruption (Control Centre, an incoming call) that never actually
        // backgrounded the app.
        privacyCover?.removeFromSuperview()
        privacyCover = nil
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    // MARK: - Push notifications (APNs)
    //
    // @capacitor/push-notifications listens on NotificationCenter for these two
    // events; without forwarding them the JS `registration` listener never fires and
    // the device is never given a token. Requires the Push Notifications capability
    // (App.entitlements → aps-environment) to be enabled on the target.

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
