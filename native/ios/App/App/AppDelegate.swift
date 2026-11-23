import UIKit
import Capacitor
import BackgroundTasks
import UserNotifications
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        TomameAlerts.shared.register()
        // Scenes own the window, so the app delegate never sees "entered background" itself.
        NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { _ in
            TomameAlerts.shared.schedule()
        }
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

/// The background check. A free Apple ID cannot receive push, so iOS's background refresh
/// wakes the app now and then (iOS picks when: minutes to hours apart) to ask Tomame for news
/// since the last check (`GET /api/app/alerts?since=`) and post it as notifications. The call
/// carries the web view's own Supabase session cookie, so it is the customer's data and no
/// one else's; cookies the server refreshes go back into the web view's store.
/// Tapping one opens `extra.href` through the LocalNotifications plugin (`cap_extra`).
final class TomameAlerts {
    static let shared = TomameAlerts()
    static let taskId = "ca.tomame.ios.refresh"
    private let sinceKey = "tm.alerts.since"

    func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.taskId, using: nil) { task in
            guard let refresh = task as? BGAppRefreshTask else { return task.setTaskCompleted(success: false) }
            self.handle(refresh)
        }
    }

    func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: Self.taskId)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private func handle(_ task: BGAppRefreshTask) {
        schedule()
        let work = Task {
            let ok = await check()
            task.setTaskCompleted(success: ok)
        }
        task.expirationHandler = { work.cancel() }
    }

    /// One check. The first ever run only records "now", so a new install never replays history.
    @discardableResult
    func check() async -> Bool {
        let defaults = UserDefaults.standard
        guard let since = defaults.string(forKey: sinceKey) else {
            defaults.set(ISO8601DateFormatter().string(from: Date()), forKey: sinceKey)
            return true
        }
        guard let origin = Self.serverOrigin(),
              var url = URLComponents(url: origin.appendingPathComponent("api/app/alerts"), resolvingAgainstBaseURL: false)
        else { return false }
        url.queryItems = [URLQueryItem(name: "since", value: since)]
        guard let requestURL = url.url else { return false }

        let store = await MainActor.run { WKWebsiteDataStore.default().httpCookieStore }
        let cookies = await store.allCookies().filter { requestURL.host?.hasSuffix($0.domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))) ?? false }
        guard !cookies.isEmpty else { return true } // signed out: nothing to ask for

        var request = URLRequest(url: requestURL, timeoutInterval: 20)
        HTTPCookie.requestHeaderFields(with: cookies).forEach { request.setValue($1, forHTTPHeaderField: $0) }
        request.setValue("TomameIOS background", forHTTPHeaderField: "User-Agent")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return false }
            if let fields = http.allHeaderFields as? [String: String] {
                for cookie in HTTPCookie.cookies(withResponseHeaderFields: fields, for: requestURL) {
                    await store.setCookie(cookie)
                }
            }
            guard http.statusCode == 200 else { return http.statusCode == 401 }
            let body = try JSONDecoder().decode(AlertsResponse.self, from: data)
            for alert in body.data.alerts {
                await post(alert)
            }
            defaults.set(body.data.now, forKey: sinceKey)
            return true
        } catch {
            return false
        }
    }

    private func post(_ alert: Alert) async {
        let content = UNMutableNotificationContent()
        content.title = alert.title
        content.body = alert.body
        content.sound = .default
        content.userInfo = ["cap_extra": ["href": alert.href, "kind": "alert"]]
        let request = UNNotificationRequest(identifier: "alert-\(alert.id)", content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(request)
    }

    /// The host the shell loads, from the bundled capacitor.config.json (`server.url`).
    static func serverOrigin() -> URL? {
        guard let file = Bundle.main.url(forResource: "capacitor.config", withExtension: "json"),
              let data = try? Data(contentsOf: file),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let server = json["server"] as? [String: Any],
              let raw = server["url"] as? String,
              let url = URL(string: raw),
              let scheme = url.scheme, let host = url.host
        else { return nil }
        var origin = "\(scheme)://\(host)"
        if let port = url.port { origin += ":\(port)" }
        return URL(string: origin)
    }

    private struct Alert: Decodable { let id: String; let title: String; let body: String; let href: String }
    private struct AlertsPayload: Decodable { let alerts: [Alert]; let now: String }
    private struct AlertsResponse: Decodable { let data: AlertsPayload }
}
