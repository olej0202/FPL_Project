# Rollback

The pre-refactor checkpoint is `../frontend-backups/20261031-094944/`.
It includes the frontend's uncommitted changes, including the latest tree/context
fixes. It contains 102 files with SHA-256 hashes. Dependencies and disposable
build-check directories are excluded.

From the frontend directory, preview restoration:

```powershell
.\Rollback-Frontend.ps1
```

Restore the checkpoint:

```powershell
.\Rollback-Frontend.ps1 -Apply
npm.cmd run build
```

Restoration checks every archived file before writing. It first saves the current
frontend into a `before-restore-*.zip` archive beside the checkpoint, then restores
the original files and removes files introduced since the checkpoint. It keeps
`node_modules`. Stop a running development server first; restart it afterwards.

The restore script also works directly if the PowerShell shortcut is unavailable:

```powershell
..\..\venv\Scripts\python.exe ..\frontend-backups\20261031-094944\restore.py --apply
```

Rollback was tested against an isolated project copy. All 102 files matched their
original hashes, added files were removed, dependencies remained, and the previous
state was archived. The report is in
`../../diagnostics/frontend-rollback-validation/result.json`.
