import urllib.request, json, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def fetch(url):
    req = urllib.request.Request(url, headers={
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Mozilla/5.0'
    })
    return json.loads(urllib.request.urlopen(req, context=ctx).read())

# Get recent failed runs
data = fetch('https://api.github.com/repos/Alpha-ashu/Kanaku/actions/runs?per_page=10&status=failure')
runs = data.get('workflow_runs', [])

for r in runs:
    run_id = r['id']
    name = r['name']
    title = r['display_title'][:60]
    print(f"RUN_ID={run_id}  NAME={name}  TITLE={title}")

print("\n--- JOBS for first failed run ---")
if runs:
    first_run = runs[0]
    jobs_data = fetch(f"https://api.github.com/repos/Alpha-ashu/Kanaku/actions/runs/{first_run['id']}/jobs")
    for job in jobs_data.get('jobs', []):
        print(f"  JOB_ID={job['id']}  NAME={job['name']}  CONCLUSION={job['conclusion']}")
        for step in job.get('steps', []):
            if step.get('conclusion') == 'failure':
                print(f"    FAILED STEP: {step['name']}")
