import urllib.request
import json

# Check dependabot alerts
headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Python'
}
url = "https://api.github.com/repos/Alpha-ashu/Kanaku/dependabot/alerts?per_page=50&state=open"
req = urllib.request.Request(url, headers=headers)
try:
    data = json.loads(urllib.request.urlopen(req).read())
    print(f"Total open alerts: {len(data)}")
    for a in data:
        pkg = a['security_advisory']['package']['name']
        severity = a['security_advisory']['severity']
        ecosystem = a['security_advisory']['package']['ecosystem']
        vuln = a['security_vulnerability']['vulnerable_version_range']
        fixed = a['security_vulnerability']['first_patched_version']['identifier']
        alert_url = a['html_url']
        print(f"[{severity}] {ecosystem}:{pkg} ({vuln} -> fixed in {fixed})")
        print(f"  {alert_url}")
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code} - {e.reason}")
    if e.code == 404:
        # Try without auth - might need token
        url2 = "https://api.github.com/repos/Alpha-ashu/Kanaku/security-advisories?per_page=10"
        req2 = urllib.request.Request(url2, headers=headers)
        try:
            data2 = json.loads(urllib.request.urlopen(req2).read())
            print(json.dumps(data2, indent=2)[:500])
        except:
            print("Cannot access security alerts API without authentication")