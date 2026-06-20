/**
 * @file 濡楀矂娼版い鍦窗閹垹顦插Λ鈧ù瀣侀崸? * @description 濡偓濞村顢戦棃銏犳儙閸斻劌鎻╅悡褌鑵戦弰顖氭儊鐎涙ê婀梾鎰妞ゅ湱娲版担鍡欏殠缁嬪顢戞禒宥呯摠閸︺劎娈戦幆鍛枌閵? *              閻劋绨宀勬桨閸氼垰濮╂穱顔碱槻鐠侯垰绶為惃鍕彥閻撗冭埌閻樿泛鐣ч崡顐犫偓? */

import type { OrchestrationReadModel, OrchestrationShellSnapshot } from "~/contracts";

/** 妞ゅ湱娲伴幁銏狀槻韫囶偆鍙庣猾璇茬€?*/
type ProjectRecoverySnapshot = OrchestrationReadModel | OrchestrationShellSnapshot;

/**
 * 濡偓濞村妲搁崥锕€鐡ㄩ崷銊︽た鐠哄啰鍤庣粙瀣╃稻缂傚搫鐨€电懓绨叉い鍦窗閻ㄥ嫭鍎忛崘? * @param snapshot - 妞ゅ湱娲伴幁銏狀槻韫囶偆鍙? * @returns 閺勵垰鎯佺€涙ê婀棁鈧憰浣逛划婢跺秶娈戞い鍦窗
 */
export function hasLiveThreadsWithMissingProjects(snapshot: ProjectRecoverySnapshot): boolean {
  // 閺€鍫曟肠閹碘偓閺堝婀崚鐘绘珟閻ㄥ嫰銆嶉惄?ID
  const liveProjectIds = new Set(
    snapshot.projects
      .filter((project) => !("deletedAt" in project) || project.deletedAt === null)
      .map((project) => project.id),
  );

  // 濡偓閺屻儲妲搁崥锔芥箒濞叉槒绌痪璺ㄢ柤瀵洜鏁ゆ禍鍡曠瑝鐎涙ê婀惃鍕€嶉惄?  return snapshot.threads.some((thread) => {
    const isLiveThread = !("deletedAt" in thread) || thread.deletedAt === null;
    return isLiveThread && !liveProjectIds.has(thread.projectId);
  });
}
