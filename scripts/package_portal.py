"""Build a minimal, secret-free upload package from an explicit manifest."""
import json, hashlib, zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'PORTAL-V2-MANIFEST.json').read_text())
out=root/'.test-results';out.mkdir(exist_ok=True)
files=manifest['newFiles']+manifest['modifiedFiles']
with zipfile.ZipFile(out/'ghorepawa-portal-v2-update.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in files+['PORTAL-V2-DEPLOY.md','PORTAL-V2-MANIFEST.json']:
        path=root/name
        assert path.is_file() and root in path.resolve().parents
        assert not any(x in name for x in ['node_modules','.env','uploads/products'])
        z.write(path,name)
(out/'upload-sha256.txt').write_text('\n'.join(hashlib.sha256((root/name).read_bytes()).hexdigest()+'  '+name for name in files)+'\n')
print('Prepared',len(files),'application files in',out/'ghorepawa-portal-v2-update.zip')
