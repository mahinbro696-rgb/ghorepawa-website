from pathlib import Path
import hashlib,json,zipfile
root=Path(__file__).resolve().parents[1]
m=json.loads((root/'CLIENT-FIXES-MANIFEST.json').read_text())
files=m['newFiles']+m['modifiedFiles'];assert len(files)==17 and len(set(files))==17
out=root/'client-ci';out.mkdir(exist_ok=True)
hashes={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files}
with zipfile.ZipFile(out/'ghorepawa-client-order-fixes.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in files+['CLIENT-FIXES-MANIFEST.json','CLIENT-FIXES-START.md']:
  z.write(root/p,p)
 if (root/'CLIENT-FIXES-TEST-REPORT.md').exists():z.write(root/'CLIENT-FIXES-TEST-REPORT.md','CLIENT-FIXES-TEST-REPORT.md')
 z.writestr('CLIENT-FIXES-SHA256.json',json.dumps(hashes,indent=2)+'\n')
print('Packaged exactly 17 runtime files and release notes. No secrets or customer records.')
