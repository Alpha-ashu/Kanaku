import urllib.request
import ssl
import json

ssl_ctx = ssl.create_default_context()
url = 'https://api.github.com/repos/Alpha-ashu/Kanaku/actions/runs?per_page=5&status=failure'
req = urllib.request.Request(url)
req.add_header('Accept', 'application/vnd.github.v3+json')
req.add_header('User-Agent', 'Python')

try:
    with urllib.request.urlopen(req, context=ssl_ctx) as r:
        data = json.loads(r.read())
        print(f"Total failed runs found: {data.get('total_count', 0)}")
        for run in data.get('workflow_runs', []):
            print(f"Workflow: {run['name']}")
            print(f"  Status: {run['status']}")
            print(f"  Conclusion: {run['conclusion']}")
            print(f"  Branch: {run['head_branch']}")
            print(f"  Commit: {run['head_sha'][:8]}")
            print(f"  URL: {run['html_url']}")
            print(f"  Display: {run['display_title']}")
            print()
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code}")
    print(f"Response: {e.read().decode()}")
except Exception as e:
    print(f"Error: {e}")