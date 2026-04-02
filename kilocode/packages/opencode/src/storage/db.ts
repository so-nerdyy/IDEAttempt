// kilocode_change - conditional database driver for Node.js vs Bun
import { type SQLiteTransaction } from "drizzle-orm/sqlite-core"
export * from "drizzle-orm"
import { Context } from "../util/context"
import { lazy } from "../util/lazy"
import { Global } from "../global"
import { Log } from "../util/log"
import { NamedError } from "@opencode-ai/util/error"
import z from "zod"
import path from "path"
import { readFileSync, readdirSync, existsSync } from "fs"
import * as schema from "./schema"
import { Flag } from "../flag/flag"

declare const KILO_MIGRATIONS: { sql: string; timestamp: number; name: string }[] | undefined

export const NotFoundError = NamedError.create(
  "NotFoundError",
  z.object({
    message: z.string(),
  }),
)

const log = Log.create({ service: "db" })

export namespace Database {
  // kilocode_change - always use kilo.db regardless of channel
  export const Path = path.join(Global.Path.data, "kilo.db")

  type Schema = typeof schema
  export type Transaction = SQLiteTransaction<"sync", void, Schema>

  type Journal = { sql: string; timestamp: number; name: string }[]

  const state = {
    sqlite: undefined as unknown,
  }

  function time(tag: string) {
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(tag)
    if (!match) return 0
    return Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    )
  }

  function migrations(dir: string): Journal {
    const dirs = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)

    const sql = dirs
      .map((name) => {
        const file = path.join(dir, name, "migration.sql")
        if (!existsSync(file)) return
        return {
          sql: readFileSync(file, "utf-8"),
          timestamp: time(name),
          name,
        }
      })
      .filter(Boolean) as Journal

    return sql.sort((a, b) => a.timestamp - b.timestamp)
  }

  // kilocode_change - conditional database client for Node.js vs Bun
  export const Client = lazy(() => {
    log.info("opening database", { path: Path })

    const isNode = process.env.KILO_PLATFORM === "vscode" || typeof Bun === "undefined"
    
    if (isNode) {
      // Node.js path: use better-sqlite3
      const { Database: BetterDatabase } = require("better-sqlite3")
      const { drizzle } = require("drizzle-orm/better-sqlite3")
      const { migrate } = require("drizzle-orm/better-sqlite3/migrator")
      
      const sqlite = new BetterDatabase(Path)
      state.sqlite = sqlite

      sqlite.pragma("journal_mode = WAL")
      sqlite.pragma("synchronous = NORMAL")
      sqlite.pragma("busy_timeout = 5000")
      sqlite.pragma("cache_size = -64000")
      sqlite.pragma("foreign_keys = ON")
      sqlite.pragma("wal_checkpoint(PASSIVE)")

      const db = drizzle({ client: sqlite, schema })

      const entries =
        typeof KILO_MIGRATIONS !== "undefined"
          ? KILO_MIGRATIONS
          : migrations(path.join(__dirname, "../../migration"))
          
      if (entries.length > 0) {
        log.info("applying migrations", {
          count: entries.length,
          mode: typeof KILO_MIGRATIONS !== "undefined" ? "bundled" : "dev",
        })
        if (Flag.KILO_SKIP_MIGRATIONS) {
          for (const item of entries) {
            item.sql = "select 1;"
          }
        }
        migrate(db, entries)
      }

      return db
    }
    
    // Bun path: use bun:sqlite
    const { Database: BunDatabase } = require("bun:sqlite")
    const { drizzle } = require("drizzle-orm/bun-sqlite")
    const { migrate } = require("drizzle-orm/bun-sqlite/migrator")

    const sqlite = new BunDatabase(Path, { create: true })
    state.sqlite = sqlite

    sqlite.run("PRAGMA journal_mode = WAL")
    sqlite.run("PRAGMA synchronous = NORMAL")
    sqlite.run("PRAGMA busy_timeout = 5000")
    sqlite.run("PRAGMA cache_size = -64000")
    sqlite.run("PRAGMA foreign_keys = ON")
    sqlite.run("PRAGMA wal_checkpoint(PASSIVE)")

    const db = drizzle({ client: sqlite, schema })

    const entries =
      typeof KILO_MIGRATIONS !== "undefined"
        ? KILO_MIGRATIONS
        : migrations(path.join(import.meta.dirname, "../../migration"))
        
    if (entries.length > 0) {
      log.info("applying migrations", {
        count: entries.length,
        mode: typeof KILO_MIGRATIONS !== "undefined" ? "bundled" : "dev",
      })
      if (Flag.KILO_SKIP_MIGRATIONS) {
        for (const item of entries) {
          item.sql = "select 1;"
        }
      }
      migrate(db, entries)
    }

    return db
  })

  export function close() {
    const sqlite = state.sqlite as { close?: () => void } | undefined
    if (!sqlite?.close) return
    sqlite.close()
    state.sqlite = undefined
    Client.reset()
  }

  export type TxOrDb = Transaction | ReturnType<typeof Client>

  const ctx = Context.create<{
    tx: TxOrDb
    effects: (() => void | Promise<void>)[]
  }>("database")

  export function use<T>(callback: (trx: TxOrDb) => T): T {
    try {
      return callback(ctx.use().tx)
    } catch (err) {
      if (err instanceof Context.NotFound) {
        const effects: (() => void | Promise<void>)[] = []
        const result = ctx.provide({ effects, tx: Client() }, () => callback(Client()))
        for (const effect of effects) effect()
        return result
      }
      throw err
    }
  }

  export function effect(fn: () => any | Promise<any>) {
    try {
      ctx.use().effects.push(fn)
    } catch {
      fn()
    }
  }

  export function transaction<T>(callback: (tx: TxOrDb) => T): T {
    try {
      return callback(ctx.use().tx)
    } catch (err) {
      if (err instanceof Context.NotFound) {
        const effects: (() => void | Promise<void>)[] = []
        const result = (Client().transaction as any)((tx: TxOrDb) => {
          return ctx.provide({ tx, effects }, () => callback(tx))
        })
        for (const effect of effects) effect()
        return result
      }
      throw err
    }
  }
}
