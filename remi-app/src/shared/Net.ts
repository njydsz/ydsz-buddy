/**
 * Net 濡€虫健 - 缂冩垹绮跺銉ュ徔閺堝秴濮? *
 * 閹绘劒绶甸崥顖氬З闂冭埖顔岀敮鍝ユ暏閻ㄥ嫮缍夌紒婊嗙窡閸斺晛濮涢懗鏂ょ礉閸栧懏瀚粩顖氬經閸欘垳鏁ら幀褎顥呭ù瀣ㄢ偓浣哄箚閸ョ偛婀撮崸鈧Λ鈧弻銉ｂ偓? * 娑撳瓨妞傜粩顖氬經妫板嫮鏆€缁涘鍏橀崝娑栤偓鍌氱唨娴?Effect 濡楀棙鐏︾€圭偟骞囬敍灞肩箽鐠囦胶琚崹瀣暔閸忋劌鎷伴崣顖滅矋閸氬牊鈧佲偓? *
 * @module Net
 */
import * as Net from "node:net";

import { Data, Effect, Layer, ServiceMap } from "effect";

/**
 * 缂冩垹绮堕幙宥勭稊闁挎瑨顕ょ猾璇茬€? *
 * 閻劋绨亸浣筋棅缂冩垹绮堕幙宥勭稊娑擃厼褰查懗钘夊毉閻滄壆娈戦柨娆掝嚖閿涘苯瀵橀崥顐︽晩鐠囶垱绉烽幁顖氭嫲閸欘垶鈧娈戦崢鐔奉潗闁挎瑨顕ら崢鐔锋礈閵? * 缂佈勫閼?Effect 閻?TaggedError閿涘本鏁幐浣鼓佸蹇撳爱闁板秴鎷伴柨娆掝嚖婢跺嫮鎮婇妴? *
 * @property message - 闁挎瑨顕ら幓蹇氬牚娣団剝浼? * @property cause - 閸欘垶鈧娈戦崢鐔奉潗闁挎瑨顕ょ€电钖勯敍宀€鏁ゆ禍搴濈箽閻ｆ瑩鏁婄拠顖氱垻閺嶅牆鎷扮拠锔剧矎娣団剝浼? */
export class NetError extends Data.TaggedError("NetError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * 缁鐎风€瑰牆宕奸崙鑺ユ殶閿涙艾鍨介弬顓濈娑擃亜鈧吋妲搁崥锔胯礋鐢附婀?code 鐏炵偞鈧呮畱 ErrnoException
 *
 * Node.js 閻ㄥ嫮閮寸紒鐔兼晩鐠囶垶鈧艾鐖堕崠鍛儓娑撯偓娑?code 鐏炵偞鈧嶇礄婵?'EADDRINUSE'閵?ECONNREFUSED' 缁涘绱氶敍? * 鐠囥儱鍤遍弫鎵暏娴滃骸鐣ㄩ崗銊ユ勾濡偓閺屻儱鑻熼弨鍓佺崕闁挎瑨顕ょ猾璇茬€烽妴? *
 * @param cause - 瀵板懏顥呴弻銉ф畱闁挎瑨顕ょ€电钖? * @returns 婵″倹鐏?cause 閺勵垰鐢張?string 缁鐎?code 鐏炵偞鈧呮畱鐎电钖勯崚娆掔箲閸?true
 */
function isErrnoExceptionWithCode(cause: unknown): cause is {
  readonly code: string;
} {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof (cause as { readonly code: unknown }).code === "string"
  );
}

/**
 * 鐎瑰鍙忛崗鎶芥４ TCP 閺堝秴濮熼崳? *
 * 閸︺劍绔婚悶鍡涙▉濞堜絻鐨熼悽顭掔礉韫囩晫鏆愰崗鎶芥４鏉╁洨鈻兼稉顓炲讲閼宠棄鍤悳鎵畱闁挎瑨顕ら敍? * 闁灝鍘ら崶鐘辫礋閸忔娊妫存径杈Е閼板苯濂栭崫宥呮倵缂侇厾娈戝〒鍛倞闁槒绶妴? *
 * @param server - 鐟曚礁鍙ч梻顓犳畱 Net.Server 鐎圭偘绶? */
const closeServer = (server: Net.Server) => {
  try {
    server.close();
  } catch {
    // 韫囩晫鏆愬〒鍛倞闂冭埖顔岄惃鍕彠闂傤厼銇戠拹?  }
};

/**
 * 鐏忔繆鐦０鍕殌娑撯偓娑擃亙澶嶉弮鍓侇伂閸? *
 * 闁俺绻冮崚娑樼紦娑撯偓娑擃亙澶嶉弮鍓佹畱 TCP 閺堝秴濮熼崳銊︽降閹恒垺绁撮幐鍥х暰缁旑垰褰涢弰顖氭儊閸欘垳鏁ら妴? * 婵″倹鐏夋导鐘插弳閻ㄥ嫮顏崣锝勮礋 0閿涘本鎼锋担婊呴兇缂佺喍绱伴懛顏勫З閸掑棝鍘ゆ稉鈧稉顏勫讲閻劎娈戞稉瀛樻缁旑垰褰涢妴? * 妫板嫮鏆€閹存劕濮涢崥搴ｇ彌閸楀啿鍙ч梻顓熸箛閸斺€虫珤閿涘矂鍣撮弨鍓ь伂閸欙絼绶甸崥搴ｇ敾娴ｈ法鏁ら妴? *
 * 瀹搞儰缍斿ù浣衡柤閿? * 1. 閸掓稑缂?TCP 閺堝秴濮熼崳銊ヨ嫙鐠嬪啰鏁?unref()閿涘矂浼╅崗宥夋▎濮濄垼绻樼粙瀣偓鈧崙? * 2. 閻╂垵鎯夐幐鍥х暰缁旑垰褰涢敍鍧rt 娑?0 閺冨墎鏁?OS 閸掑棝鍘ら敍? * 3. 閼惧嘲褰囩€圭偤妾崚鍡涘帳閻ㄥ嫮顏崣锝呭娇
 * 4. 閸忔娊妫撮張宥呭閸ｃ劌鑻熸潻鏂挎礀缁旑垰褰涢崣? * 5. 婵″倹鐏夋潻鍥┾柤娑擃厼鍤悳浼存晩鐠囶垽绱濇潻鏂挎礀 NetError
 *
 * @param port - 鐟曚線顣╅悾娆戞畱缁旑垰褰涢崣鍑ょ礉0 鐞涖劎銇氶悽杈ㄦ惙娴ｆ粎閮寸紒鐔诲殰閸斻劌鍨庨柊? * @returns Effect閿涘本鍨氶崝鐔告鏉╂柨娲栨０鍕殌閻ㄥ嫮顏崣锝呭娇閿涘苯銇戠拹銉︽鏉╂柨娲?NetError
 */
const tryReservePort = (port: number): Effect.Effect<number, NetError> =>
  Effect.callback<number, NetError>((resume) => {
    const server = Net.createServer();
    let settled = false;

    /**
     * 绾喕绻氶崶鐐剁殶閸欘亣顫︾拫鍐暏娑撯偓濞?     * Effect.callback 鐟曚焦鐪?resume 閸欘亣鍏樼悮顐ョ殶閻劋绔村▎鈽呯礉鐠囥儱鍤遍弫浼粹偓姘崇箖 settled 閺嶅洤绻旀担宥勭箽鐠囦浇绻栨稉鈧悙?     */
    const settle = (effect: Effect.Effect<number, NetError>) => {
      if (settled) return;
      settled = true;
      resume(effect);
    };

    // 鐠嬪啰鏁?unref() 娴ｆ寧婀囬崝鈥虫珤娑撳秳绱伴梼缁橆剾 Node.js 鏉╂稓鈻奸柅鈧崙?    server.unref();

    // 閻╂垵鎯夐柨娆掝嚖娴滃娆㈤敍鍫濐洤缁旑垰褰涚悮顐㈠窗閻劊鈧焦娼堥梽鎰瑝鐡掑磭鐡戦敍?    server.once("error", (cause) => {
      settle(Effect.fail(new NetError({ message: "Could not find an available port.", cause })));
    });

    // 閻╂垵鎯夐幋鎰閸氬氦骞忛崣鏍伂閸欙絽褰块獮璺哄彠闂傤厽婀囬崝鈥虫珤
    server.listen(port, () => {
      const address = server.address();
      // address 閸欘垵鍏橀弰?string閵嗕苟ull 閹?object閿涘矁绻栭柌灞藉涧婢跺嫮鎮?object 閹懎鍠?      const resolved = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => {
        if (resolved > 0) {
          settle(Effect.succeed(resolved));
          return;
        }
        settle(Effect.fail(new NetError({ message: "Could not find an available port." })));
      });
    });

    // 鏉╂柨娲栧〒鍛倞闁槒绶敍姘秼 Effect 鐞氼偂鑵戦弬顓熸閸忔娊妫撮張宥呭閸?    return Effect.sync(() => {
      closeServer(server);
    });
  });

/**
 * 缂冩垹绮堕張宥呭閹恒儱褰涚€规矮绠? *
 * 閹诲繗鍫禍?NetService 閹绘劒绶甸惃鍕閺堝缍夌紒婊嗙窡閸斺晛濮涢懗鏂ょ礉閸栧懏瀚敍? * - 濡偓閺屻儲瀵氱€规矮瀵岄張鍝勬嫲缁旑垰褰涢惃鍕讲缂佹垵鐣鹃幀? * - 濡偓閺屻儳骞嗛崶鐐叉勾閸р偓閿涘湜Pv4 閸?IPv6閿涘绗傞惃鍕伂閸欙絽褰查悽銊︹偓? * - 妫板嫮鏆€娑撳瓨妞傞悳顖氭礀缁旑垰褰? * - 閺屻儲澹橀崣顖滄暏缁旑垰褰涢敍鍫熸暜閹镐線顩婚柅澶岊伂閸欙綇绱? */
export interface NetServiceShape {
  /**
   * 濡偓閺?TCP 閺堝秴濮熼崳銊︽Ц閸氾箑褰叉禒銉х拨鐎规艾鍩岄幐鍥х暰閻ㄥ嫪瀵岄張鍝勬嫲缁旑垰褰?   *
   * @param port - 鐟曚焦顥呴弻銉ф畱缁旑垰褰涢崣?   * @param host - 鐟曚焦顥呴弻銉ф畱娑撶粯婧€閸︽澘娼?   * @returns Effect閿涘矁绻戦崶?boolean 鐞涖劎銇氶弰顖氭儊閸欘垯浜掔紒鎴濈暰
   */
  readonly canListenOnHost: (port: number, host: string) => Effect.Effect<boolean>;

  /**
   * 濡偓閺屻儳骞嗛崶鐐叉勾閸р偓閿?27.0.0.1 閸?::1閿涘绗傞惃鍕伂閸欙絽褰查悽銊︹偓?   *
   * 閸氬本妞傚Λ鈧弻?IPv4 閸?IPv6 閻滎垰娲栭崷鏉挎絻閿涘苯褰ч張澶夎⒈閼板懘鍏橀崣顖滄暏閺冭埖澧犳潻鏂挎礀 true閵?   * 鏉╂瑧鈥樻穱婵呯啊閺堝秴濮熼崣顖欎簰閸︺劌寮婚弽鍫㈠箚婢у啩绗呭锝呯埗閸氼垰濮╅妴?   *
   * @param port - 鐟曚焦顥呴弻銉ф畱缁旑垰褰涢崣?   * @returns Effect閿涘矁绻戦崶?boolean 鐞涖劎銇氱粩顖氬經閸︺劎骞嗛崶鐐叉勾閸р偓娑撳﹥妲搁崥锕€褰查悽?   */
  readonly isPortAvailableOnLoopback: (port: number) => Effect.Effect<boolean>;

  /**
   * 妫板嫮鏆€娑撯偓娑擃亙澶嶉弮鍓佸箚閸ョ偟顏崣锝呰嫙缁斿宓嗛柌濠冩杹
   *
   * 闁俺绻冪紒鎴濈暰閸掓壆顏崣?0 鐠佲晜鎼锋担婊呴兇缂佺喕鍤滈崝銊ュ瀻闁板秴褰查悽銊ь伂閸欙綇绱濋懢宄板絿缁旑垰褰涢崣宄版倵缁斿宓嗛崗鎶芥４閺堝秴濮熼崳銊ｂ偓?   * 鏉╂柨娲栭惃鍕伂閸欙絽褰块崣顖欎簰閻劋绨崥搴ｇ敾閻ㄥ嫭婀囬崝鈥虫儙閸旑煉绱濈涵顔荤箽缁旑垰褰涢崷銊︻梾閺屻儲妞傜涵顔肩杽閸欘垳鏁ら妴?   *
   * @param host - 閸欘垶鈧娈戞稉缁樻簚閸︽澘娼冮敍宀勭帛鐠併倓璐?"127.0.0.1"
   * @returns Effect閿涘本鍨氶崝鐔告鏉╂柨娲栨０鍕殌閻ㄥ嫮顏崣锝呭娇閿涘苯銇戠拹銉︽鏉╂柨娲?NetError
   */
  readonly reserveLoopbackPort: (host?: string) => Effect.Effect<number, NetError>;

  /**
   * 閺屻儲澹樻稉鈧稉顏勫讲閻劎娈戦惄鎴濇儔缁旑垰褰?   *
   * 娴兼ê鍘涚亸婵婄槸娴ｈ法鏁ゆ＃鏍偓澶岊伂閸欙綇绱濇俊鍌涚亯鐠囥儳顏崣锝勭瑝閸欘垳鏁ら敍鍫ｎ潶閸楃姷鏁ら幋鏍ㄦ綀闂勬劒绗夌搾绛圭礆閿?   * 閸掓瑥娲栭柅鈧崚鎷岊唨閹垮秳缍旂化鑽ょ埠閼奉亜濮╅崚鍡涘帳娑撯偓娑擃亙澶嶉弮鍓侇伂閸欙綇绱檖ort = 0閿涘鈧?   *
   * @param preferred - 妫ｆ牠鈧娈戠粩顖氬經閸?   * @returns Effect閿涘矁绻戦崶鐐插讲閻劎娈戠粩顖氬經閸欏嚖绱濇径杈Е閺冩儼绻戦崶?NetError
   */
  readonly findAvailablePort: (preferred: number) => Effect.Effect<number, NetError>;
}

/**
 * NetService - 閸氼垰濮╅梼鑸殿唽缂冩垹绮舵潏鍛И瀹搞儱鍙块惃鍕箛閸斺剝鐖ｇ粵? *
 * 閸╄桨绨?Effect 閻?ServiceMap 鐎圭偟骞囬敍灞惧絹娓氭稐绶风挧鏍ㄦ暈閸忋儴鍏橀崝娑栤偓? * 闁俺绻?NetService.layer 閸欘垯浜掗懢宄板絿鐠囥儲婀囬崝锛勬畱鐎圭偟骞囩仦鍌︾礉娓氭稑鍙炬禒鏍侀崸妞惧▏閻劊鈧? *
 * 閺堝秴濮熼弽鍥槕缁楋讣绱癅remi-code/shared/Net/NetService
 */
export class NetService extends ServiceMap.Service<NetService, NetServiceShape>()(
  "~/shared/Net/NetService",
) {
  /**
   * NetService 閻ㄥ嫬鐤勯悳鏉跨湴
   *
   * 娴ｈ法鏁?Layer.sync 閸掓稑缂撻崥灞绢劄鐏炲偊绱濋幓鎰返 NetServiceShape 閹恒儱褰涢惃鍕暚閺佹潙鐤勯悳鑸偓?   * 閹碘偓閺堝鏌熷▔鏇㈠厴閸╄桨绨?Effect.callback 鐏忎浇顥?Node.js 閻ㄥ嫬绱撳銉х秹缂佹粍鎼锋担婊愮礉
   * 绾喕绻氭稉?Effect 閻㈢喐鈧胶閮寸紒鐔烘畱閺冪姷绱抽梿鍡樺灇閵?   */
  static readonly layer = Layer.sync(NetService, () => {
    /**
     * 濡偓閺?TCP 閺堝秴濮熼崳銊︽Ц閸氾箑褰叉禒銉х拨鐎规艾鍩岄幐鍥х暰閻ㄥ嫪瀵岄張鍝勬嫲缁旑垰褰?     *
     * 鐎圭偟骞囩紒鍡氬Ν閿?     * - 閸掓稑缂撴稉瀛樻 TCP 閺堝秴濮熼崳銊ヨ嫙鐏忔繆鐦紒鎴濈暰
     * - 婵″倹鐏夐崙铏瑰箛 EADDRNOTAVAIL 闁挎瑨顕ら敍鍫濇勾閸р偓娑撳秴褰查悽顭掔礆閿涘矁顫嬫稉鍝勫讲閻?     *   鏉╂瑦妲告稉杞扮啊閸忕厧顔愬▽鈩冩箒 IPv6 閺€顖涘瘮閻ㄥ嫮骞嗘晶鍐跨礉闁灝鍘ら悳顖氭礀閸欘垳鏁ら幀褎顥呴弻銉ャ亼鐠?     * - 閸忔湹绮柨娆掝嚖閿涘牆顩?EADDRINUSE閿涘顫嬫稉杞扮瑝閸欘垳鏁?     * - 缂佹垵鐣鹃幋鎰閸氬海鐝涢崡鍐插彠闂傤厽婀囬崝鈥虫珤楠炴儼绻戦崶?true
     *
     * @param port - 鐟曚焦顥呴弻銉ф畱缁旑垰褰涢崣?     * @param host - 鐟曚焦顥呴弻銉ф畱娑撶粯婧€閸︽澘娼?     * @returns Effect閿涘矁绻戦崶?boolean 鐞涖劎銇氶弰顖氭儊閸欘垯浜掔紒鎴濈暰
     */
    const canListenOnHost = (port: number, host: string): Effect.Effect<boolean> =>
      Effect.callback<boolean>((resume) => {
        const server = Net.createServer();
        let settled = false;

        const settle = (value: boolean) => {
          if (settled) return;
          settled = true;
          resume(Effect.succeed(value));
        };

        server.unref();

        server.once("error", (cause) => {
          // EADDRNOTAVAIL 鐞涖劎銇氶崷鏉挎絻娑撳秴褰查悽顭掔礄婵?IPv6 閺堫亜鎯庨悽顭掔礆
          // 鐏忓棗鍙剧憴鍡曡礋"閸欘垳鏁?閺勵垯璐熸禍鍡涗缉閸忓秴婀崣顏呮箒 IPv4 閻ㄥ嫮骞嗘晶鍐ц厬濡偓閺屻儱銇戠拹?          if (isErrnoExceptionWithCode(cause) && cause.code === "EADDRNOTAVAIL") {
            settle(true);
            return;
          }
          settle(false);
        });

        server.once("listening", () => {
          server.close(() => {
            settle(true);
          });
        });

        server.listen({ host, port });

        return Effect.sync(() => {
          closeServer(server);
        });
      });

    /**
     * 妫板嫮鏆€娑撯偓娑擃亙澶嶉弮鍓佸箚閸ョ偟顏崣锝呰嫙缁斿宓嗛柌濠冩杹
     *
     * 闁俺绻冪紒鎴濈暰閸掓壆顏崣?0 鐠佲晜鎼锋担婊呴兇缂佺喕鍤滈崝銊ュ瀻闁板秴褰查悽銊ь伂閸欙綇绱濋懢宄板絿缁旑垰褰涢崣宄版倵缁斿宓嗛崗鎶芥４閺堝秴濮熼崳銊ｂ偓?     * 鏉╂柨娲栭惃鍕伂閸欙絽褰块崣顖欎簰閻劋绨崥搴ｇ敾閻ㄥ嫭婀囬崝鈥虫儙閸旑煉绱濈涵顔荤箽缁旑垰褰涢崷銊︻梾閺屻儲妞傜涵顔肩杽閸欘垳鏁ら妴?     *
     * @param host - 閻滎垰娲栭崷鏉挎絻閿涘矂绮拋銈勮礋 "127.0.0.1"
     * @returns Effect閿涘本鍨氶崝鐔告鏉╂柨娲栨０鍕殌閻ㄥ嫮顏崣锝呭娇閿涘苯銇戠拹銉︽鏉╂柨娲?NetError
     */
    const reserveLoopbackPort = (host = "127.0.0.1"): Effect.Effect<number, NetError> =>
      Effect.callback<number, NetError>((resume) => {
        const probe = Net.createServer();
        let settled = false;

        const settle = (effect: Effect.Effect<number, NetError>) => {
          if (settled) return;
          settled = true;
          resume(effect);
        };

        probe.once("error", (cause) => {
          settle(Effect.fail(new NetError({ message: "Failed to reserve loopback port", cause })));
        });

        probe.listen(0, host, () => {
          const address = probe.address();
          const port = typeof address === "object" && address !== null ? address.port : 0;
          probe.close(() => {
            if (port > 0) {
              settle(Effect.succeed(port));
              return;
            }
            settle(Effect.fail(new NetError({ message: "Failed to reserve loopback port" })));
          });
        });

        return Effect.sync(() => {
          closeServer(probe);
        });
      });

    return {
      canListenOnHost,
      /**
       * 濡偓閺屻儳骞嗛崶鐐叉勾閸р偓娑撳﹦娈戠粩顖氬經閸欘垳鏁ら幀?       *
       * 閸氬本妞傚Λ鈧弻?IPv4閿?27.0.0.1閿涘鎷?IPv6閿?:1閿涘骞嗛崶鐐叉勾閸р偓閿?       * 娴ｈ法鏁?Effect.zipWith 楠炴儼顢戦幍褑顢戞稉銈勯嚋濡偓閺屻儻绱濋崣顏呮箒娑撱倛鈧懘鍏橀崣顖滄暏閺冭埖澧犳潻鏂挎礀 true閵?       */
      isPortAvailableOnLoopback: (port) =>
        Effect.zipWith(
          canListenOnHost(port, "127.0.0.1"),
          canListenOnHost(port, "::1"),
          (ipv4, ipv6) => ipv4 && ipv6,
        ),
      reserveLoopbackPort,
      /**
       * 閺屻儲澹橀崣顖滄暏缁旑垰褰?       *
       * 娴兼ê鍘涚亸婵婄槸娴ｈ法鏁ゆ＃鏍偓澶岊伂閸欙綇绱濇俊鍌涚亯婢惰精瑙﹂敍鍫㈩伂閸欙綀顫﹂崡鐘垫暏缁涘绱氶敍?       * 閸掓瑥娲栭柅鈧崚棰佸▏閻劎顏崣?0 鐠佲晜鎼锋担婊呴兇缂佺喕鍤滈崝銊ュ瀻闁板秲鈧?       * 娴ｈ法鏁?Effect.catch 閹规洝骞忕粭顑跨濞嗏€崇毦鐠囨洜娈戞径杈Е楠炶埖澧界悰灞芥礀闁偓闁槒绶妴?       */
      findAvailablePort: (preferred) =>
        Effect.catch(tryReservePort(preferred), () => tryReservePort(0)),
    } satisfies NetServiceShape;
  });
}
