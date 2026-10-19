import { join } from "node:path";
import { tmpdir } from "node:os";
export const deploymentProject = join(tmpdir(), "sugo-deployment-e2e-project");
export const deploymentRevision = { projectPath: deploymentProject, commit: "a".repeat(40), state: "committed", recordedAt: new Date().toISOString(), files: [] };
export async function seedDeployment(db, userId, workspace) {
 const now = new Date().toISOString();
 const image = "123.dkr.ecr.ap-northeast-2.amazonaws.com/sugo-deployment-e2e-project:1";
 const inventory = [{ service: "ecs", resources: [{ kind: "service", id: "e2e-service", metadata: { cluster: "e2e-cluster", status: "ACTIVE", rolloutState: "COMPLETED", runningCount: 1, desiredCount: 1, images: [image], runtimeImages: [{ image, imageDigest: "sha256:abc", tags: [deploymentRevision.commit] }] } }] }];
 await db.exec("INSERT INTO user_aws_context_accounts (user_id, name, profile, region, account_id, principal_arn, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [userId, "dev", "isolated-fixture", "ap-northeast-2", "123", "test", now]);
 await db.exec("INSERT INTO user_aws_context_snapshots (user_id, account_name, payload, observed_at) VALUES (?, ?, ?, ?)", [userId, "dev", JSON.stringify(inventory), now]);
 await db.exec("INSERT INTO user_project_integration_mappings (user_id, project_path, selections, updated_at) VALUES (?, ?, ?, ?)", [userId, deploymentProject, JSON.stringify([{ accountName: "dev", service: "e2e-service", cluster: "e2e-cluster", environment: "dev" }]), now]);
 const workspaceId = (await db.query("SELECT id FROM sugo_workspaces WHERE user_id = ? AND name = ?", [userId, workspace]))[0].id;
 await db.exec("INSERT INTO sugo_workspace_projects (workspace_id, project_path) VALUES (?, ?)", [workspaceId, deploymentProject]);
}
