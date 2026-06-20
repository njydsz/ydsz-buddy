/**
 * Net 妯″潡 - 缃戠粶宸ュ叿鏈嶅姟
 *
 * 鎻愪緵鍚姩闃舵甯哥敤鐨勭綉缁滆緟鍔╁姛鑳斤紝鍖呮嫭绔彛鍙敤鎬ф娴嬨€佺幆鍥炲湴鍧€妫€鏌ャ€? * 涓存椂绔彛棰勭暀绛夎兘鍔涖€傚熀浜?Effect 妗嗘灦瀹炵幇锛屼繚璇佺被鍨嬪畨鍏ㄥ拰鍙粍鍚堟€с€? *
 * @module Net
 */
import * as Net from "node:net";

import { Data, Effect, Layer, ServiceMap } from "effect";

/**
 * 缃戠粶鎿嶄綔閿欒绫诲瀷
 *
 * 鐢ㄤ簬灏佽缃戠粶鎿嶄綔涓彲鑳藉嚭鐜扮殑閿欒锛屽寘鍚敊璇秷鎭拰鍙€夌殑鍘熷閿欒鍘熷洜銆? * 缁ф壙鑷?Effect 鐨?TaggedError锛屾敮鎸佹ā寮忓尮閰嶅拰閿欒澶勭悊銆? *
 * @property message - 閿欒鎻忚堪淇℃伅
 * @property cause - 鍙€夌殑鍘熷閿欒瀵硅薄锛岀敤浜庝繚鐣欓敊璇爢鏍堝拰璇︾粏淇℃伅
 */
export class NetError extends Data.TaggedError("NetError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/**
 * 绫诲瀷瀹堝崼鍑芥暟锛氬垽鏂竴涓€兼槸鍚︿负甯︽湁 code 灞炴€х殑 ErrnoException
 *
 * Node.js 鐨勭郴缁熼敊璇€氬父鍖呭惈涓€涓?code 灞炴€э紙濡?'EADDRINUSE'銆?ECONNREFUSED' 绛夛級锛? * 璇ュ嚱鏁扮敤浜庡畨鍏ㄥ湴妫€鏌ュ苟鏀剁獎閿欒绫诲瀷銆? *
 * @param cause - 寰呮鏌ョ殑閿欒瀵硅薄
 * @returns 濡傛灉 cause 鏄甫鏈?string 绫诲瀷 code 灞炴€х殑瀵硅薄鍒欒繑鍥?true
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
 * 瀹夊叏鍏抽棴 TCP 鏈嶅姟鍣? *
 * 鍦ㄦ竻鐞嗛樁娈佃皟鐢紝蹇界暐鍏抽棴杩囩▼涓彲鑳藉嚭鐜扮殑閿欒锛? * 閬垮厤鍥犱负鍏抽棴澶辫触鑰屽奖鍝嶅悗缁殑娓呯悊閫昏緫銆? *
 * @param server - 瑕佸叧闂殑 Net.Server 瀹炰緥
 */
const closeServer = (server: Net.Server) => {
  try {
    server.close();
  } catch {
    // 蹇界暐娓呯悊闃舵鐨勫叧闂け璐?  }
};

/**
 * 灏濊瘯棰勭暀涓€涓复鏃剁鍙? *
 * 閫氳繃鍒涘缓涓€涓复鏃剁殑 TCP 鏈嶅姟鍣ㄦ潵鎺㈡祴鎸囧畾绔彛鏄惁鍙敤銆? * 濡傛灉浼犲叆鐨勭鍙ｄ负 0锛屾搷浣滅郴缁熶細鑷姩鍒嗛厤涓€涓彲鐢ㄧ殑涓存椂绔彛銆? * 棰勭暀鎴愬姛鍚庣珛鍗冲叧闂湇鍔″櫒锛岄噴鏀剧鍙ｄ緵鍚庣画浣跨敤銆? *
 * 宸ヤ綔娴佺▼锛? * 1. 鍒涘缓 TCP 鏈嶅姟鍣ㄥ苟璋冪敤 unref()锛岄伩鍏嶉樆姝㈣繘绋嬮€€鍑? * 2. 鐩戝惉鎸囧畾绔彛锛坧ort 涓?0 鏃剁敱 OS 鍒嗛厤锛? * 3. 鑾峰彇瀹為檯鍒嗛厤鐨勭鍙ｅ彿
 * 4. 鍏抽棴鏈嶅姟鍣ㄥ苟杩斿洖绔彛鍙? * 5. 濡傛灉杩囩▼涓嚭鐜伴敊璇紝杩斿洖 NetError
 *
 * @param port - 瑕侀鐣欑殑绔彛鍙凤紝0 琛ㄧず鐢辨搷浣滅郴缁熻嚜鍔ㄥ垎閰? * @returns Effect锛屾垚鍔熸椂杩斿洖棰勭暀鐨勭鍙ｅ彿锛屽け璐ユ椂杩斿洖 NetError
 */
const tryReservePort = (port: number): Effect.Effect<number, NetError> =>
  Effect.callback<number, NetError>((resume) => {
    const server = Net.createServer();
    let settled = false;

    /**
     * 纭繚鍥炶皟鍙璋冪敤涓€娆?     * Effect.callback 瑕佹眰 resume 鍙兘琚皟鐢ㄤ竴娆★紝璇ュ嚱鏁伴€氳繃 settled 鏍囧織浣嶄繚璇佽繖涓€鐐?     */
    const settle = (effect: Effect.Effect<number, NetError>) => {
      if (settled) return;
      settled = true;
      resume(effect);
    };

    // 璋冪敤 unref() 浣挎湇鍔″櫒涓嶄細闃绘 Node.js 杩涚▼閫€鍑?    server.unref();

    // 鐩戝惉閿欒浜嬩欢锛堝绔彛琚崰鐢ㄣ€佹潈闄愪笉瓒崇瓑锛?    server.once("error", (cause) => {
      settle(Effect.fail(new NetError({ message: "Could not find an available port.", cause })));
    });

    // 鐩戝惉鎴愬姛鍚庤幏鍙栫鍙ｅ彿骞跺叧闂湇鍔″櫒
    server.listen(port, () => {
      const address = server.address();
      // address 鍙兘鏄?string銆乶ull 鎴?object锛岃繖閲屽彧澶勭悊 object 鎯呭喌
      const resolved = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => {
        if (resolved > 0) {
          settle(Effect.succeed(resolved));
          return;
        }
        settle(Effect.fail(new NetError({ message: "Could not find an available port." })));
      });
    });

    // 杩斿洖娓呯悊閫昏緫锛氬綋 Effect 琚腑鏂椂鍏抽棴鏈嶅姟鍣?    return Effect.sync(() => {
      closeServer(server);
    });
  });

/**
 * 缃戠粶鏈嶅姟鎺ュ彛瀹氫箟
 *
 * 鎻忚堪浜?NetService 鎻愪緵鐨勬墍鏈夌綉缁滆緟鍔╁姛鑳斤紝鍖呮嫭锛? * - 妫€鏌ユ寚瀹氫富鏈哄拰绔彛鐨勫彲缁戝畾鎬? * - 妫€鏌ョ幆鍥炲湴鍧€锛圛Pv4 鍜?IPv6锛変笂鐨勭鍙ｅ彲鐢ㄦ€? * - 棰勭暀涓存椂鐜洖绔彛
 * - 鏌ユ壘鍙敤绔彛锛堟敮鎸侀閫夌鍙ｏ級
 */
export interface NetServiceShape {
  /**
   * 妫€鏌?TCP 鏈嶅姟鍣ㄦ槸鍚﹀彲浠ョ粦瀹氬埌鎸囧畾鐨勪富鏈哄拰绔彛
   *
   * @param port - 瑕佹鏌ョ殑绔彛鍙?   * @param host - 瑕佹鏌ョ殑涓绘満鍦板潃
   * @returns Effect锛岃繑鍥?boolean 琛ㄧず鏄惁鍙互缁戝畾
   */
  readonly canListenOnHost: (port: number, host: string) => Effect.Effect<boolean>;

  /**
   * 妫€鏌ョ幆鍥炲湴鍧€锛?27.0.0.1 鍜?::1锛変笂鐨勭鍙ｅ彲鐢ㄦ€?   *
   * 鍚屾椂妫€鏌?IPv4 鍜?IPv6 鐜洖鍦板潃锛屽彧鏈変袱鑰呴兘鍙敤鏃舵墠杩斿洖 true銆?   * 杩欑‘淇濅簡鏈嶅姟鍙互鍦ㄥ弻鏍堢幆澧冧笅姝ｅ父鍚姩銆?   *
   * @param port - 瑕佹鏌ョ殑绔彛鍙?   * @returns Effect锛岃繑鍥?boolean 琛ㄧず绔彛鍦ㄧ幆鍥炲湴鍧€涓婃槸鍚﹀彲鐢?   */
  readonly isPortAvailableOnLoopback: (port: number) => Effect.Effect<boolean>;

  /**
   * 棰勭暀涓€涓复鏃剁幆鍥炵鍙ｅ苟绔嬪嵆閲婃斁
   *
   * 閫氳繃缁戝畾鍒扮鍙?0 璁╂搷浣滅郴缁熻嚜鍔ㄥ垎閰嶅彲鐢ㄧ鍙ｏ紝鑾峰彇绔彛鍙峰悗绔嬪嵆鍏抽棴鏈嶅姟鍣ㄣ€?   * 杩斿洖鐨勭鍙ｅ彿鍙互鐢ㄤ簬鍚庣画鐨勬湇鍔″惎鍔紝纭繚绔彛鍦ㄦ鏌ユ椂纭疄鍙敤銆?   *
   * @param host - 鍙€夌殑涓绘満鍦板潃锛岄粯璁や负 "127.0.0.1"
   * @returns Effect锛屾垚鍔熸椂杩斿洖棰勭暀鐨勭鍙ｅ彿锛屽け璐ユ椂杩斿洖 NetError
   */
  readonly reserveLoopbackPort: (host?: string) => Effect.Effect<number, NetError>;

  /**
   * 鏌ユ壘涓€涓彲鐢ㄧ殑鐩戝惉绔彛
   *
   * 浼樺厛灏濊瘯浣跨敤棣栭€夌鍙ｏ紝濡傛灉璇ョ鍙ｄ笉鍙敤锛堣鍗犵敤鎴栨潈闄愪笉瓒筹級锛?   * 鍒欏洖閫€鍒拌鎿嶄綔绯荤粺鑷姩鍒嗛厤涓€涓复鏃剁鍙ｏ紙port = 0锛夈€?   *
   * @param preferred - 棣栭€夌殑绔彛鍙?   * @returns Effect锛岃繑鍥炲彲鐢ㄧ殑绔彛鍙凤紝澶辫触鏃惰繑鍥?NetError
   */
  readonly findAvailablePort: (preferred: number) => Effect.Effect<number, NetError>;
}

/**
 * NetService - 鍚姩闃舵缃戠粶杈呭姪宸ュ叿鐨勬湇鍔℃爣绛? *
 * 鍩轰簬 Effect 鐨?ServiceMap 瀹炵幇锛屾彁渚涗緷璧栨敞鍏ヨ兘鍔涖€? * 閫氳繃 NetService.layer 鍙互鑾峰彇璇ユ湇鍔＄殑瀹炵幇灞傦紝渚涘叾浠栨ā鍧椾娇鐢ㄣ€? *
 * 鏈嶅姟鏍囪瘑绗︼細@remi-code/shared/Net/NetService
 */
export class NetService extends ServiceMap.Service<NetService, NetServiceShape>()(
  "~/shared/Net/NetService",
) {
  /**
   * NetService 鐨勫疄鐜板眰
   *
   * 浣跨敤 Layer.sync 鍒涘缓鍚屾灞傦紝鎻愪緵 NetServiceShape 鎺ュ彛鐨勫畬鏁村疄鐜般€?   * 鎵€鏈夋柟娉曢兘鍩轰簬 Effect.callback 灏佽 Node.js 鐨勫紓姝ョ綉缁滄搷浣滐紝
   * 纭繚涓?Effect 鐢熸€佺郴缁熺殑鏃犵紳闆嗘垚銆?   */
  static readonly layer = Layer.sync(NetService, () => {
    /**
     * 妫€鏌?TCP 鏈嶅姟鍣ㄦ槸鍚﹀彲浠ョ粦瀹氬埌鎸囧畾鐨勪富鏈哄拰绔彛
     *
     * 瀹炵幇缁嗚妭锛?     * - 鍒涘缓涓存椂 TCP 鏈嶅姟鍣ㄥ苟灏濊瘯缁戝畾
     * - 濡傛灉鍑虹幇 EADDRNOTAVAIL 閿欒锛堝湴鍧€涓嶅彲鐢級锛岃涓哄彲鐢?     *   杩欐槸涓轰簡鍏煎娌℃湁 IPv6 鏀寔鐨勭幆澧冿紝閬垮厤鐜洖鍙敤鎬ф鏌ュけ璐?     * - 鍏朵粬閿欒锛堝 EADDRINUSE锛夎涓轰笉鍙敤
     * - 缁戝畾鎴愬姛鍚庣珛鍗冲叧闂湇鍔″櫒骞惰繑鍥?true
     *
     * @param port - 瑕佹鏌ョ殑绔彛鍙?     * @param host - 瑕佹鏌ョ殑涓绘満鍦板潃
     * @returns Effect锛岃繑鍥?boolean 琛ㄧず鏄惁鍙互缁戝畾
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
          // EADDRNOTAVAIL 琛ㄧず鍦板潃涓嶅彲鐢紙濡?IPv6 鏈惎鐢級
          // 灏嗗叾瑙嗕负"鍙敤"鏄负浜嗛伩鍏嶅湪鍙湁 IPv4 鐨勭幆澧冧腑妫€鏌ュけ璐?          if (isErrnoExceptionWithCode(cause) && cause.code === "EADDRNOTAVAIL") {
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
     * 棰勭暀涓€涓复鏃剁幆鍥炵鍙ｅ苟绔嬪嵆閲婃斁
     *
     * 閫氳繃缁戝畾鍒扮鍙?0 璁╂搷浣滅郴缁熻嚜鍔ㄥ垎閰嶅彲鐢ㄧ鍙ｏ紝鑾峰彇绔彛鍙峰悗绔嬪嵆鍏抽棴鏈嶅姟鍣ㄣ€?     * 杩斿洖鐨勭鍙ｅ彿鍙互鐢ㄤ簬鍚庣画鐨勬湇鍔″惎鍔紝纭繚绔彛鍦ㄦ鏌ユ椂纭疄鍙敤銆?     *
     * @param host - 鐜洖鍦板潃锛岄粯璁や负 "127.0.0.1"
     * @returns Effect锛屾垚鍔熸椂杩斿洖棰勭暀鐨勭鍙ｅ彿锛屽け璐ユ椂杩斿洖 NetError
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
       * 妫€鏌ョ幆鍥炲湴鍧€涓婄殑绔彛鍙敤鎬?       *
       * 鍚屾椂妫€鏌?IPv4锛?27.0.0.1锛夊拰 IPv6锛?:1锛夌幆鍥炲湴鍧€锛?       * 浣跨敤 Effect.zipWith 骞惰鎵ц涓や釜妫€鏌ワ紝鍙湁涓よ€呴兘鍙敤鏃舵墠杩斿洖 true銆?       */
      isPortAvailableOnLoopback: (port) =>
        Effect.zipWith(
          canListenOnHost(port, "127.0.0.1"),
          canListenOnHost(port, "::1"),
          (ipv4, ipv6) => ipv4 && ipv6,
        ),
      reserveLoopbackPort,
      /**
       * 鏌ユ壘鍙敤绔彛
       *
       * 浼樺厛灏濊瘯浣跨敤棣栭€夌鍙ｏ紝濡傛灉澶辫触锛堢鍙ｈ鍗犵敤绛夛級锛?       * 鍒欏洖閫€鍒颁娇鐢ㄧ鍙?0 璁╂搷浣滅郴缁熻嚜鍔ㄥ垎閰嶃€?       * 浣跨敤 Effect.catch 鎹曡幏绗竴娆″皾璇曠殑澶辫触骞舵墽琛屽洖閫€閫昏緫銆?       */
      findAvailablePort: (preferred) =>
        Effect.catch(tryReservePort(preferred), () => tryReservePort(0)),
    } satisfies NetServiceShape;
  });
}
