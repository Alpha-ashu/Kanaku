till import urllib.request
import json

url = "https://api.github.com/repos/Alpha-ashu/Kanaku/actions/runs?per_page=10"
data = json.loads(urllib.request.urlopen(url).read())
for r in data['workflow_runs']:
    print(f"{r['display_title'][:60]}: {r['conclusion']} | {r['name']} | status={r['status']}")