import { z } from "zod";

const DockerIdBodySchema = z.object({ Id: z.string() });
const DockerExecExitSchema = z.object({ ExitCode: z.number() });
const DockerContainerRowSchema = z.object({
  Id: z.string(),
  Labels: z.record(z.string(), z.string()).default({}),
});

export function parseDockerIdBody(raw: unknown): string {
  return DockerIdBodySchema.parse(raw).Id;
}

export function parseDockerExecExit(raw: unknown): number {
  return DockerExecExitSchema.parse(raw).ExitCode;
}

export function parseDockerContainerList(raw: unknown): Array<{ Id: string; Labels: Record<string, string> }> {
  if (!Array.isArray(raw)) {
    throw new TypeError("Docker container list response must be an array");
  }
  return raw.map((row) => DockerContainerRowSchema.parse(row));
}