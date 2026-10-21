import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {type Project} from '../src/shared';

export type JobKind = 'analyze' | 'render';
export type Job = {id: string; project_id: string; kind: JobKind; payload: string; attempts: number};

// One always-on service, one durable local disk, one worker. Do not run multiple
// replicas against different disks; that needs a shared queue/object store.
export class JobQueue {
  private db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL,
        payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, error TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_job ON jobs(project_id)
        WHERE status IN ('queued','running');`);
  }
  recover() {
    // One retry for an interrupted attempt. Do not loop indefinitely on a
    // repeatable crash; leave a failed job available for an explicit retry.
    this.db.exec("UPDATE jobs SET status='queued' WHERE status='running' AND attempts < 2; UPDATE jobs SET status='failed', error='The server interrupted this job twice. Please retry.' WHERE status='running';");
  }
  enqueue(kind: JobKind, project: Project) {
    if (this.active(project.id)) throw Object.assign(new Error('An edit or render is already queued for this project.'), {status: 409});
    const id = randomUUID();
    this.db.prepare("INSERT INTO jobs(id,project_id,kind,payload,status,created_at) VALUES(?,?,?,?,'queued',?)").run(id, project.id, kind, JSON.stringify(project), Date.now());
    return id;
  }
  active(projectId: string): Job | undefined {
    return this.db.prepare("SELECT * FROM jobs WHERE project_id=? AND status IN ('queued','running') LIMIT 1").get(projectId) as Job | undefined;
  }
  latestError(projectId: string): string | undefined {
    const row = this.db.prepare('SELECT status,error FROM jobs WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(projectId);
    return row?.status === 'failed' ? String(row.error) : undefined;
  }
  claim(): Job | undefined {
    return this.db.prepare("UPDATE jobs SET status='running', attempts=attempts+1 WHERE id=(SELECT id FROM jobs WHERE status='queued' ORDER BY created_at,rowid LIMIT 1) RETURNING *").get() as Job | undefined;
  }
  complete(id: string, error?: string) {
    this.db.prepare('UPDATE jobs SET status=?,error=? WHERE id=?').run(error ? 'failed' : 'completed', error || null, id);
  }
  close() {this.db.close();}
}

export function projectWithJob(project: Project, queue: JobQueue): Project {
  const job = queue.active(project.id);
  return {...project, status: job ? job.kind === 'render' ? 'rendering' : 'analyzing' : 'idle', error: job ? undefined : project.error || queue.latestError(project.id)};
}
