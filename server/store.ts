import {mkdir, readdir, readFile, rename, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fullLengthPlan, type Project} from '../src/shared';

export const dataDir = path.resolve(process.env.MCC_DATA_DIR || '.data');
export const mediaDir = path.join(dataDir, 'media');
export const exportDir = path.join(dataDir, 'exports');
const projectDir = path.join(dataDir, 'projects');
export async function initializeStorage() {await Promise.all([mediaDir, exportDir, projectDir, path.join(dataDir, 'tmp')].map(p => mkdir(p, {recursive: true})));}
export async function saveProject(project: Project) {
  const target = path.join(projectDir, `${project.id}.json`);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(project, null, 2));
  await rename(temporary, target);
}
export async function listProjects(): Promise<Project[]> {
  const files = (await readdir(projectDir)).filter(name => /^[a-f0-9-]{36}\.json$/.test(name));
  const projects = await Promise.all(files.map(name => readProject(name.slice(0, -5))));
  return projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function readProject(id: string): Promise<Project> {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw Object.assign(new Error('Project not found.'), {status: 404});
  try {const project: Project = JSON.parse(await readFile(path.join(projectDir, `${id}.json`), 'utf8'));
    if (!project.plan) project.plan = fullLengthPlan(project.video.duration, project.video.name);
    return project;}
  catch {throw Object.assign(new Error('Project not found.'), {status: 404});}
}
