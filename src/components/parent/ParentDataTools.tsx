import { useState, type ChangeEvent } from 'react'
import { localRepository } from '../../data/localRepository'

const downloadText = (contents: string, filename: string, type: string) => {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function ParentDataTools({ onRestored }: { onRestored: () => void }) {
  const [message, setMessage] = useState('')
  const date = new Date().toISOString().slice(0, 10)

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const json = await file.text()
      localRepository.validateBackupJson(json)
      if (!window.confirm('Replace all current Music Tree data with this backup? This cannot be undone.')) {
        setMessage('Import cancelled. Current data was not changed.')
        return
      }
      localRepository.restoreBackupJson(json)
      onRestored()
      setMessage('Backup restored successfully.')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'The backup could not be imported.')
    }
  }

  return (
    <section className="card parent-data-tools" data-parent-section="data-tools" aria-labelledby="data-backup-title">
      <h2 id="data-backup-title">Data &amp; Backup</h2>
      <p>Download a private backup or practice-history file to this device.</p>
      <div className="data-tool-actions">
        <button type="button" className="mini-button" onClick={() => downloadText(localRepository.exportBackupJson(), `music-tree-backup-${date}.json`, 'application/json')}>Export complete backup</button>
        <button type="button" className="mini-button" onClick={() => downloadText(localRepository.exportPracticeCsv(), `music-tree-practice-${date}.csv`, 'text/csv;charset=utf-8')}>Export practice CSV</button>
        <label className="mini-button import-file-button">Import JSON backup<input type="file" accept="application/json,.json" onChange={importBackup} /></label>
      </div>
      <small>Files stay on this device. CSV import is not supported.</small>
      {message && <p className="data-tool-message" role="status">{message}</p>}
    </section>
  )
}
