import os
import zipfile
import shutil
import sys

def package_ios_ipa():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ipa_path = os.path.join(root, "kanaku-unsigned.ipa")
    backup_path = os.path.join(root, "kanaku-unsigned.ipa.bak")
    public_dir = os.path.join(root, "ios", "App", "App", "public")
    new_ipa_path = os.path.join(root, "kanaku-unsigned.ipa.tmp")
    ios_app_ipa = os.path.join(root, "ios", "App", "Kanaku-unsigned.ipa")

    if not os.path.exists(ipa_path):
        print(f"Base IPA template not found at {ipa_path}")
        sys.exit(1)

    if not os.path.exists(public_dir):
        print(f"Public web directory not found at {public_dir}. Run 'npm run mobile:build:ios' first.")
        sys.exit(1)

    print("Packaging updated iOS assets into unsigned IPA...")
    shutil.copy2(ipa_path, backup_path)

    with zipfile.ZipFile(backup_path, 'r') as zin, zipfile.ZipFile(new_ipa_path, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
        # Copy all non-public entries preserving exact headers & permissions
        for item in zin.infolist():
            if 'Payload/App.app/public/' not in item.filename:
                buffer = zin.read(item.filename)
                zout.writestr(item, buffer)

        # Add new public files from latest iOS sync
        prefix = 'Payload/App.app/public/'
        zout.writestr(prefix, '')
        for r, dirs, files in os.walk(public_dir):
            for f in files:
                full_path = os.path.join(r, f)
                rel_path = os.path.relpath(full_path, public_dir).replace('\\', '/')
                archive_name = prefix + rel_path
                zout.write(full_path, archive_name)

    if os.path.exists(new_ipa_path):
        os.replace(new_ipa_path, ipa_path)
        if os.path.exists(backup_path):
            os.remove(backup_path)
        shutil.copy2(ipa_path, ios_app_ipa)
        print(f"SUCCESS: Updated {ipa_path} and {ios_app_ipa}")

if __name__ == "__main__":
    package_ios_ipa()
