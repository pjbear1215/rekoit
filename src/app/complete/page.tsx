"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import StepIndicator from "@/components/StepIndicator";
import Button from "@/components/Button";
import BluetoothPowerControl from "@/components/BluetoothPowerControl";
import DiagnosisPanel from "@/components/DiagnosisPanel";
import KeyboardSwapControl from "@/components/KeyboardSwapControl";
import SectionDivider from "@/components/SectionDivider";
import StatusCheck from "@/components/StatusCheck";
import { useSetup } from "@/lib/store";
import { useGuard } from "@/lib/useGuard";

interface VerifyResult {
  name: string;
  pass: boolean;
  detail: string;
}

function getInstallSummary(installHangul: boolean, installBtKeyboard: boolean): string {
  if (installHangul && installBtKeyboard) {
    return "한글 입력 엔진과 블루투스 도우미 설치를 확인합니다.";
  }
  if (installHangul) {
    return "한글 입력 엔진 설정을 확인합니다.";
  }
  return "블루투스 도우미 설치를 확인합니다.";
}

export default function CompletePage() {
  const allowed = useGuard();
  const router = useRouter();
  const { state, setState } = useSetup();
  const [results, setResults] = useState<VerifyResult[]>([]);
  const [verifying, setVerifying] = useState(true);
  const [installedState, setInstalledState] = useState({
    hangul: state.installHangul,
    bt: state.installBtKeyboard,
  });
  
  const [btDevices, setBtDevices] = useState<Array<{ address: string; connected: boolean; name: string }>>([]);
  const [btLoading, setBtLoading] = useState(false);
  const [btRemovingAddr, setBtRemovingAddr] = useState<string | null>(null);
  
  const [fontUploading, setFontUploading] = useState(false);
  const [fontResult, setFontResult] = useState<string | null>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);

  const placeholderChecks = [
    ...(installedState.hangul ? ["한글 폰트", "한글 입력 데몬"] : []),
    ...(installedState.bt ? ["블루투스"] : []),
  ];

  const loadBtDevices = useCallback(async () => {
    if (!state.ip || !state.password) return;
    setBtLoading(true);
    try {
      const res = await fetch("/api/bluetooth/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: state.ip, password: state.password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBtDevices(data.devices || []);
      }
    } catch {
      // ignore
    } finally {
      setBtLoading(false);
    }
  }, [state.ip, state.password]);

  useEffect(() => {
    if (!allowed) return;
    const verify = async () => {
      try {
        // 1. 기기 가용성 재확인 (상태 동기화)
        const availabilityRes = await fetch("/api/manage/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: state.ip, password: state.password }),
        });
        
        let isBtInstalled = state.installBtKeyboard;
        if (availabilityRes.ok) {
          const availData = await availabilityRes.json();
          setInstalledState({
            hangul: availData.hangulInstalled,
            bt: availData.btInstalled,
          });
          isBtInstalled = availData.btInstalled;
        }

        // 2. 구성 요소 검증
        const res = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ip: state.ip,
            password: state.password,
            hangul: state.installHangul,
            bt: state.installBtKeyboard,
          }),
        });
        const data = await res.json();
        setResults(data.results);

        // 3. 블루투스 기기 목록 로드
        if (isBtInstalled) {
          void loadBtDevices();
        }
      } catch {
        setResults([{
          name: "검증 실패",
          pass: false,
          detail: "서버에 연결할 수 없습니다.",
        }]);
      } finally {
        setVerifying(false);
      }
    };
    verify();
  }, [allowed, state.installBtKeyboard, state.installHangul, state.ip, state.password, loadBtDevices]);

  const handleBtRemove = useCallback(
    async (address: string, name: string) => {
      if (!confirm(`'${name}' 기기를 삭제하시겠습니까?`)) return;
      setBtRemovingAddr(address);
      try {
        const res = await fetch("/api/bluetooth/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: state.ip, password: state.password, address }),
        });
        const data = await res.json();
        if (data.success) {
          setBtDevices(prev => prev.filter(d => d.address !== address));
        } else {
          alert(`삭제 실패: ${data.error ?? "알 수 없는 오류"}`);
        }
      } catch {
        alert("서버 오류가 발생했습니다.");
      } finally {
        setBtRemovingAddr(null);
      }
    },
    [state.ip, state.password],
  );

  const handleFontUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFontUploading(true);
      setFontResult(null);

      const formData = new FormData();
      formData.append("font", file);
      formData.append("ip", state.ip);
      formData.append("password", state.password);

      try {
        const res = await fetch("/api/font/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.success) {
          setFontResult(data.message);
        } else {
          setFontResult(`실패: ${data.error}`);
        }
      } catch {
        setFontResult("서버 오류");
      } finally {
        setFontUploading(false);
        if (fontInputRef.current) fontInputRef.current.value = "";
      }
    },
    [state.ip, state.password],
  );

  const allPassed = results.length > 0 && results.every((r) => r.pass);
  const hasFail = results.length > 0 && results.some((r) => !r.pass);
  const failedCheckNames = results.filter((r) => !r.pass).map((r) => r.name);
  const hasHangulFail = failedCheckNames.some((name) => name === "한글 폰트" || name === "한글 입력 데몬");
  const hasBtFail = failedCheckNames.includes("블루투스");
  const returnPath = state.ip && state.password ? "/entry" : "/";

  if (!allowed) return null;

  return (
    <div className="animate-fade-in-up">
      <StepIndicator currentStep={6} />

      <div className="space-y-6">
        <div>
          <h1
            className="text-[36px] font-bold leading-tight"
            style={{ color: "#000000" }}
          >
            {verifying ? "확인 중..." : allPassed ? "설치 완료" : "설치 결과"}
          </h1>
          <p
            className="mt-3 text-[17px] font-medium"
            style={{ color: "#666666" }}
          >
            {getInstallSummary(installedState.hangul, installedState.bt)}
          </p>
        </div>

        <div className="stagger-1">
          <div className="operator-card operator-card-strong" style={{ padding: "20px 24px", border: "1.5px solid #000000" }}>
            <div className="space-y-8">
              {/* 검증 상태 */}
              <div
                className="border border-black/10 overflow-hidden bg-black/[0.02]"
              >
                {verifying ? (
                  placeholderChecks.map((name) => (
                    <StatusCheck key={name} label={name} status="checking" />
                  ))
                ) : (
                  results.map((result) => (
                    <StatusCheck
                      key={result.name}
                      label={result.name}
                      status={result.pass ? "pass" : "fail"}
                      detail={result.detail}
                    />
                  ))
                )}
              </div>

              {/* 결과 메시지 */}
              {!verifying && allPassed && (
                <div
                  className="text-center py-8 bg-[#e6f4ea] border border-[#1e8e3e] animate-scale-in"
                >
                  <p className="text-[20px] font-bold" style={{ color: "#1e8e3e" }}>
                    설치가 완료되었습니다
                  </p>
                  <div className="text-[15px] mt-2 font-medium space-y-1" style={{ color: "rgba(0,0,0,0.6)" }}>
                    {installedState.hangul && (
                      <>
                        <p>Type Folio나 블루투스 키보드에서 <span className="font-bold text-black">Shift + Space</span> 또는 <span className="font-bold text-black">오른쪽 Alt</span> 키로 한/영을 전환하세요.</p>
                        <div className="mt-4 p-4 bg-white/50 border border-black/5 text-left space-y-2">
                          <p className="text-[13px] font-bold text-black uppercase tracking-wider mb-2">특수 기호 입력 안내</p>
                          <p className="text-[14px] leading-relaxed">
                            <span className="shrink-0 mr-1.5">•</span>
                            <span className="font-bold text-black">{"[ ] { }"}</span> 키는 모든 모드에서 괄호 입력으로 우선 동작합니다.
                          </p>
                          <p className="text-[14px] leading-relaxed">
                            <span className="shrink-0 mr-1.5">•</span>
                            Type Folio의 기호(<span className="font-mono">´ ` ~ ¨</span>) 자리는 이제 <span className="font-bold text-black">{"[ { ] }"}</span> 가 입력됩니다.
                          </p>
                          <p className="text-[14px] leading-relaxed">
                            <span className="shrink-0 mr-1.5">•</span>
                            백틱(<span className="font-mono">`</span>)은 <span className="font-bold text-black">Ctrl + Shift + [</span>, 물결(<span className="font-mono">~</span>)은 <span className="font-bold text-black">Ctrl + Shift + ]</span> 단축키를 사용하세요.
                          </p>
                        </div>
                      </>
                    )}
                    {installedState.bt && (
                      <p className="pt-2">블루투스 키보드를 켜면 자동으로 연결을 시도합니다.</p>
                    )}
                  </div>
                </div>
              )}

              {/* 실패 시 안내 */}
              {!verifying && hasFail && (
                <div
                  className="p-6 bg-[#fce8e6] border border-[#d93025] animate-fade-in"
                >
                  <p className="font-bold text-[17px]" style={{ color: "#d93025" }}>
                    일부 항목에서 문제가 발견되었습니다
                  </p>
                  <ul className="mt-3 space-y-2 text-[14px] font-medium" style={{ color: "rgba(0,0,0,0.7)" }}>
                    {hasHangulFail && (
                      <li>한글 입력 엔진 문제가 있으면 기기를 재시작한 뒤 다시 확인하세요.</li>
                    )}
                    {hasHangulFail && (
                      <li>데몬 문제 시 <code className="text-[12px] font-mono px-1.5 py-0.5 bg-black text-white">systemctl restart hangul-daemon</code></li>
                    )}
                    {hasBtFail && (
                      <li>블루투스 도우미 설치 문제가 있으면 기기를 재시작한 뒤 다시 확인하세요.</li>
                    )}
                    <li>&quot;처음으로&quot;를 눌러 설치를 다시 진행해 보세요.</li>
                  </ul>
                </div>
              )}

              {/* 빠른 관리 도구 */}
              {!verifying && (
                <div className="space-y-8 border-t border-black/10 pt-8">
                  {installedState.hangul && (
                    <div className="space-y-4">
                      <SectionDivider label="키보드 레이아웃" />
                      <KeyboardSwapControl ip={state.ip} password={state.password} />
                    </div>
                  )}

                  {installedState.bt && (
                    <div className="space-y-6">
                      <SectionDivider label="블루투스 제어" />
                      
                      {/* 등록된 기기 목록 */}
                      <div className="space-y-3">
                        <label className="block text-[13px] font-bold uppercase tracking-wider px-1">등록된 기기</label>
                        <div className="space-y-2">
                          {btLoading && btDevices.length === 0 ? (
                            <div className="p-4 bg-black/[0.03] border border-black/5 text-center text-[13px] text-muted animate-pulse">
                              기기 목록을 불러오는 중...
                            </div>
                          ) : btDevices.length > 0 ? (
                            btDevices.map((device) => (
                              <div
                                key={device.address}
                                className="flex items-center justify-between p-4 bg-black/[0.03] border border-black/5"
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-2.5 h-2.5 rounded-full ${device.connected ? "bg-green-500" : "bg-black/20"}`} />
                                  <div>
                                    <p className="text-[15px] font-bold text-black">{device.name || "이름 없는 기기"}</p>
                                    <p className="text-[12px] font-mono opacity-50">{device.address}</p>
                                  </div>
                                </div>
                                <Button 
                                  variant="secondary" 
                                  size="sm" 
                                  onClick={() => handleBtRemove(device.address, device.name)}
                                  loading={btRemovingAddr === device.address}
                                  className="font-bold border-none bg-black/5 hover:bg-red-50 hover:text-red-600 transition-colors"
                                >
                                  삭제
                                </Button>
                              </div>
                            ))
                          ) : (
                            <div className="p-8 bg-black/[0.03] border border-black/5 text-center">
                              <p className="text-[14px] text-muted font-medium">등록된 블루투스 기기가 없습니다.</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-black/[0.03] border border-black/5">
                        <div className="min-w-0">
                          <p className="text-[16px] font-bold text-black">새 키보드 연결</p>
                          <p className="text-[13px] font-medium opacity-50 mt-0.5">다른 키보드 연결이 필요할 때 사용하세요.</p>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => router.push("/bluetooth?mode=manage")}
                          className="font-bold"
                        >
                          설정 열기
                        </Button>
                      </div>
                      <BluetoothPowerControl ip={state.ip} password={state.password} />
                    </div>
                  )}

                  {installedState.hangul && (
                    <div className="space-y-4">
                      <SectionDivider label="폰트 관리" />
                      <div className="flex items-center justify-between p-4 bg-black/[0.03] border border-black/5">
                        <span className="text-[15px] font-bold">사용자 폰트 업로드</span>
                        <input ref={fontInputRef} type="file" accept=".otf,.ttf" onChange={handleFontUpload} className="hidden" />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => fontInputRef.current?.click()}
                          loading={fontUploading}
                          className="font-bold"
                        >
                          파일 선택
                        </Button>
                      </div>
                      {fontResult && (
                        <p className="text-[13px] font-bold px-1" style={{ color: fontResult.includes("실패") ? "#d93025" : "#1e8e3e" }}>
                          {fontResult}
                        </p>
                      )}
                    </div>
                  )}

                  <DiagnosisPanel
                    ip={state.ip}
                    password={state.password}
                    title="시스템 진단"
                    subtitle="입력 엔진 동작 상태 점검"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 네비게이션 */}
        <div className="flex justify-between pt-4 stagger-2">
          <Button variant="ghost" onClick={() => router.push(returnPath)} disabled={verifying} icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>}>
            처음으로
          </Button>
          <Button onClick={() => router.push("/manage")} disabled={verifying} size="lg" className="px-12 font-bold">
            기기 관리로
          </Button>
        </div>
      </div>
    </div>
  );
}
