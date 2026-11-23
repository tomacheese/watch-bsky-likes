import fs from 'node:fs'
import path from 'node:path'

export class Notified {
  private static get filePath(): string {
    return process.env.NOTIFIED_FILE ?? 'data/notified.json'
  }

  private static read(): string[] {
    const filePath = Notified.filePath
    if (!fs.existsSync(filePath)) return []
    const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (!Array.isArray(value)) {
      throw new TypeError(`Invalid notification state in ${filePath}`)
    }
    return value.map((item: unknown) => {
      if (typeof item !== 'string') {
        throw new TypeError(`Invalid notification state in ${filePath}`)
      }
      return item
    })
  }

  private static write(items: string[]): void {
    const filePath = Notified.filePath
    const directory = fs.mkdtempSync(
      path.join(path.dirname(filePath), '.notified-')
    )
    const temporaryFile = path.join(directory, 'state.json')
    try {
      fs.writeFileSync(temporaryFile, JSON.stringify(items))
      fs.renameSync(temporaryFile, filePath)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  }

  public static isFirst(): boolean {
    if (!fs.existsSync(Notified.filePath)) return true
    Notified.read()
    return false
  }

  public static isNotified(at: string): boolean {
    return Notified.read().includes(at)
  }

  public static saveBaseline(items: string[]): void {
    Notified.write(items)
  }

  public static addNotified(at: string): void {
    const items = Notified.read()
    items.push(at)
    Notified.write(items)
  }
}
