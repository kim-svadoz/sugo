import { expect, it } from "vitest";
import { deploymentInclusionLabel } from "./specDeployment.js";
it("keeps unconfirmed and partial deployments distinct from confirmed inclusion or absence", () => {
 expect(deploymentInclusionLabel({included:1,total:1,unknown:false})).toBe("포함");
 expect(deploymentInclusionLabel({included:0,total:1,unknown:false})).toBe("미포함");
 expect(deploymentInclusionLabel({included:0,total:1,unknown:true})).toBe("확인 중");
 expect(deploymentInclusionLabel({included:1,total:2,unknown:false})).toBe("일부 포함");
 expect(deploymentInclusionLabel({included:1,total:2,unknown:true})).toBe("일부 포함");
 expect(deploymentInclusionLabel({included:0,total:0,unknown:false})).toBe("작업 없음");
});
