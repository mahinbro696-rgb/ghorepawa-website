"""Build an update ZIP from an explicit allowlist; never include secrets or uploads."""
import hashlib, json, zipfile
from pathlib import Path
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'PORTAL-V2-MANIFEST.json').read_text())
files = manifest['newFiles'] + manifest['modifiedFiles']
assert len(files) == len(set(files)), 'Duplicate deployment path'
assert all(not Path(name).is_absolute() and '..' not in Path(name).parts for name in files)
out = root / '.test-results'
out.mkdir(exist_ok=True)
archive = out / 'ghorepawa-portal-v2-update.zip'
hashes = {}
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in files:
        data = (root / name).read_bytes()
        hashes[name] = hashlib.sha256(data).hexdigest()
        z.writestr(name, data)
    for name in ['PORTAL-V2-DEPLOY.md', 'PORTAL-V2-MANIFEST.json', 'PORTAL-V2-START-BN.md', 'PORTAL-V2-TEST-REPORT.md']:
        if (root / name).is_file():
            z.write(root / name, name)
    z.writestr('PORTAL-V2-SHA256.json', json.dumps(hashes, indent=2) + '\n')
print(f'Prepared {len(files)} application files in {archive}')
