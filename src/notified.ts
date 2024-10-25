import fs from 'node:fs'

export class Notified {
  private static PATH = {
    NOTIFIED_FILE: process.env.NOTIFIED_FILE ?? 'data/notified.json',
  }

  public static isFirst(): boolean {
    const path = Notified.PATH.NOTIFIED_FILE
    return !fs.existsSync(path)
  }

  public static isNotified(at: string): boolean {
    const path = Notified.PATH.NOTIFIED_FILE
    const json: string[] = fs.existsSync(path)
      ? JSON.parse(fs.readFileSync(path, 'utf8'))
      : []
    return json.includes(at)
  }

  public static addNotified(at: string): void {
    const path = Notified.PATH.NOTIFIED_FILE
    const json: string[] = fs.existsSync(path)
      ? JSON.parse(fs.readFileSync(path, 'utf8'))
      : []
    json.push(at)
    fs.writeFileSync(path, JSON.stringify(json))
  }
}
