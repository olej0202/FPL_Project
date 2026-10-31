"""Preview restoration, or use --apply to restore the frontend checkpoint."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
checkpoint = Path(__file__).resolve().parent
target = checkpoint.parents[1] / 'football-frontend'
assert target.resolve().parent == checkpoint.parents[1].resolve()
assert (target / 'package.json').is_file(), target
manifest = json.loads((checkpoint / 'manifest.json').read_text(encoding='utf-8'))
excluded = {'node_modules', '.vite', '.git', '.mobile-check', '.tree-build-check'}
with zipfile.ZipFile(checkpoint / 'frontend.zip') as archive:
    for name, digest in manifest.items():
        path = (target / name).resolve()
        assert path.is_relative_to(target.resolve()), name
        assert hashlib.sha256(archive.read(name)).hexdigest() == digest, name
    current = [path for path in target.rglob('*') if path.is_file()
               and not any(part in excluded for part in path.relative_to(target).parts)]
    extras = [path for path in current if path.relative_to(target).as_posix() not in manifest]
    print(f'Restore {len(manifest)} original files and remove {len(extras)} files added since checkpoint.')
    print(f'Target: {target}')
    if not args.apply:
        print('Preview only. Run this script with --apply to restore. Dependencies are kept.')
    else:
        from datetime import datetime
        safety = checkpoint / ('before-restore-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.zip')
        with zipfile.ZipFile(safety, 'w', zipfile.ZIP_DEFLATED) as saved:
            for path in current:
                saved.write(path, path.relative_to(target).as_posix())
        for path in extras:
            assert path.resolve().is_relative_to(target.resolve())
            path.unlink()
        for name in manifest:
            path = target / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(archive.read(name))
        print(f'Restored. Previous state saved to {safety}')
