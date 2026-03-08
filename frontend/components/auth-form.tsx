"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  ArrowRight,
  Gift,
  Key,
  Loader2,
  LogIn,
  Send,
  Shield,
  User,
  UserPlus,
  VenetianMask,
  X,
} from "lucide-react";
import { useAuth, ADMIN_LOGIN } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AuthFormProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthForm({ isOpen, onClose }: AuthFormProps) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loginStep, setLoginStep] = useState<1 | 2>(1);
  const [loginVal, setLoginVal] = useState("");
  const [password, setPassword] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [refCode, setRefCode] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { login, register, requestAdminCode, verifyAdminCode, verifyOtp } =
    useAuth();
  const router = useRouter();

  const isAdminLogin = loginVal.trim().toLowerCase() === ADMIN_LOGIN;

  const isFormValid = isAdminLogin
    ? loginVal.trim() !== "" && (codeSent ? adminCode.trim().length >= 4 : true)
    : tab === "login"
      ? loginStep === 1
        ? loginVal.trim() !== ""
        : codeSent
          ? adminCode.trim().length >= 4
          : password.trim() !== ""
      : loginVal.trim() !== "" && password.trim() !== "" && termsAccepted;

  const handleAdminAction = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!codeSent) {
        await requestAdminCode(loginVal.trim());
        setCodeSent(true);
      } else {
        await verifyAdminCode(loginVal.trim(), adminCode.trim());
        onClose();
        router.push("/me");
      }
    } catch (e) {
      setError((e as Error).message || "Ошибка авторизации");
    } finally {
      setIsLoading(false);
    }
  };

  const handleNextStep = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await login(loginVal.trim(), "");
      if (res === "requireOtp") {
        setCodeSent(true);
        setLoginStep(2);
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "Password required for typical login") {
        setCodeSent(false);
        setLoginStep(2);
      } else {
        setError(msg || "Ошибка авторизации");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAdminLogin) {
      handleAdminAction();
      return;
    }

    if (tab === "login" && loginStep === 1) {
      handleNextStep();
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      if (tab === "login") {
        if (codeSent) {
          await verifyOtp(loginVal.trim(), adminCode.trim());
        } else {
          await login(loginVal.trim(), password);
        }
      } else {
        await register(loginVal.trim(), password, refCode || undefined);
      }
      onClose();
      router.push("/me");
    } catch (e) {
      setError((e as Error).message || "Ошибка авторизации");
    } finally {
      setIsLoading(false);
    }
  };

  const btnDisabled = isLoading || !isFormValid;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 bg-background/60 backdrop-blur-xl"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 24 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="relative w-full max-w-[400px] z-10"
          >
            <Card className="border-border/60 relative overflow-hidden bg-background shadow-none">
              <div className="absolute top-[-20%] right-[-10%] w-40 h-40 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-[-20%] left-[-10%] w-40 h-40 bg-primary/15 rounded-full blur-3xl pointer-events-none" />

              <Button
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 rounded-full w-8 h-8 text-muted-foreground hover:bg-muted/50 z-20 cursor-pointer"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </Button>

              <CardHeader className="text-center relative z-10 pt-8">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.35, delay: 0.1 }}
                  className="mx-auto bg-primary text-primary-foreground p-3 rounded-2xl mb-3 w-fit"
                >
                  <VenetianMask className="w-6 h-6" />
                </motion.div>
                <CardTitle className="text-2xl font-bold tracking-tight">
                  lowkey
                </CardTitle>
                <CardDescription>
                  Безопасное и быстрое соединение
                </CardDescription>
              </CardHeader>

              {!isAdminLogin && (
                <div className="px-6 pb-2 relative z-10">
                  <div className="bg-muted/60 border border-border/50 p-1 rounded-xl flex gap-1">
                    {(["login", "register"] as const).map((currentTab) => (
                      <button
                        key={currentTab}
                        type="button"
                        onClick={() => {
                          setTab(currentTab);
                          setError(null);
                          setLoginStep(1);
                        }}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${tab === currentTab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {currentTab === "login" ? "Вход" : "Регистрация"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isAdminLogin && (
                <div className="px-6 pb-2 relative z-10">
                  <div className="flex items-center gap-2 justify-center bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-2.5">
                    <Shield className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-bold text-amber-500">
                      {codeSent
                        ? "Код отправлен в Telegram"
                        : "Вход администратора"}
                    </span>
                  </div>
                </div>
              )}

              <CardContent className="relative z-10 pt-4">
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <Label
                      htmlFor="auth-login"
                      className="font-semibold text-sm"
                    >
                      Логин
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="auth-login"
                        type="text"
                        placeholder="Ваш логин"
                        className="pl-10 h-11 bg-muted/30 focus-visible:bg-transparent transition-colors shadow-none"
                        value={loginVal}
                        onChange={(e) => {
                          setLoginVal(e.target.value);
                          setError(null);
                          setCodeSent(false);
                        }}
                        required
                      />
                    </div>
                  </div>

                  <AnimatePresence mode="wait">
                    {isAdminLogin ? (
                      <motion.div
                        key="admin-code"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-2 overflow-hidden"
                      >
                        {codeSent && (
                          <>
                            <Label
                              htmlFor="admin-code"
                              className="font-semibold text-sm flex items-center gap-1.5"
                            >
                              <Shield className="w-3.5 h-3.5 text-amber-500" />
                              Код из Telegram
                            </Label>
                            <Input
                              id="admin-code"
                              type="text"
                              inputMode="numeric"
                              placeholder="••••••"
                              maxLength={8}
                              className="h-12 text-center font-mono text-xl tracking-[0.4em] bg-muted/30 focus-visible:bg-transparent shadow-none focus-visible:ring-opacity-50 border-amber-500/30 focus-visible:ring-amber-500"
                              value={adminCode}
                              onChange={(e) =>
                                setAdminCode(e.target.value.replace(/\D/g, ""))
                              }
                              autoFocus
                            />
                          </>
                        )}
                      </motion.div>
                    ) : tab === "login" && loginStep === 2 ? (
                      codeSent ? (
                        <motion.div
                          key="user-code"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="space-y-2 overflow-hidden"
                        >
                          <Label
                            htmlFor="user-code"
                            className="font-semibold text-sm flex items-center gap-1.5"
                          >
                            <Shield className="w-3.5 h-3.5 text-primary" />
                            Код из Telegram
                          </Label>
                          <Input
                            id="user-code"
                            type="text"
                            inputMode="numeric"
                            placeholder="••••••"
                            maxLength={8}
                            className="h-12 text-center font-mono text-xl tracking-[0.4em] bg-muted/30 focus-visible:bg-transparent shadow-none focus-visible:ring-opacity-50 border-primary/30 focus-visible:ring-primary"
                            value={adminCode}
                            onChange={(e) =>
                              setAdminCode(e.target.value.replace(/\D/g, ""))
                            }
                            autoFocus
                          />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="password"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="space-y-2 overflow-hidden"
                        >
                          <Label
                            htmlFor="password"
                            className="font-semibold text-sm flex items-start flex-col gap-1"
                          >
                            <span>Пароль</span>
                            <span className="text-xs text-muted-foreground font-normal">
                              Этот аккаунт не привязан к Telegram. Введите
                              обычный пароль.
                            </span>
                          </Label>
                          <div className="relative">
                            <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              id="password"
                              type="password"
                              placeholder="••••••••"
                              className="pl-10 h-11 bg-muted/30 focus-visible:bg-transparent transition-colors shadow-none"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              autoFocus
                            />
                          </div>
                        </motion.div>
                      )
                    ) : tab === "register" ? (
                      <motion.div
                        key="password-reg"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-2 overflow-hidden"
                      >
                        <Label
                          htmlFor="password"
                          className="font-semibold text-sm"
                        >
                          Пароль
                        </Label>
                        <div className="relative">
                          <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            className="pl-10 h-11 bg-muted/30 focus-visible:bg-transparent transition-colors shadow-none"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                          />
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  <AnimatePresence>
                    {tab === "register" && !isAdminLogin && (
                      <motion.div
                        key="refcode"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="space-y-2 overflow-hidden"
                      >
                        <Label
                          htmlFor="refcode"
                          className="font-semibold text-sm flex items-center gap-1.5"
                        >
                          <Gift className="w-3.5 h-3.5 text-primary" />
                          Реферальный код{" "}
                          <span className="text-muted-foreground font-normal">
                            (необязательно)
                          </span>
                        </Label>
                        <Input
                          id="refcode"
                          type="text"
                          placeholder="Например: NOPASS7X"
                          className="h-11 bg-muted/30 font-mono uppercase tracking-wider focus-visible:bg-transparent transition-colors shadow-none"
                          value={refCode}
                          onChange={(e) =>
                            setRefCode(e.target.value.toUpperCase())
                          }
                          maxLength={12}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/25 rounded-xl px-4 py-2.5">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          {error}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </form>
              </CardContent>

              <CardFooter className="flex-col gap-3 pb-7 relative z-10 pt-0">
                {tab === "register" && !isAdminLogin && (
                  <div className="w-full flex items-start px-1 gap-3 pb-1">
                    <Checkbox
                      id="terms"
                      className="mt-1 shrink-0 cursor-pointer"
                      checked={termsAccepted}
                      onCheckedChange={(value) =>
                        setTermsAccepted(value as boolean)
                      }
                    />
                    <label
                      htmlFor="terms"
                      className="text-xs text-muted-foreground leading-snug cursor-pointer"
                    >
                      Принимаю условия{" "}
                      <a
                        href="/legal/offer"
                        className="text-foreground underline underline-offset-2 hover:text-primary transition-colors"
                      >
                        Оферты
                      </a>{" "}
                      и{" "}
                      <a
                        href="/legal/privacy"
                        className="text-foreground underline underline-offset-2 hover:text-primary transition-colors"
                      >
                        Политики конфиденциальности
                      </a>
                    </label>
                  </div>
                )}
                <div className="w-full">
                  <Button
                    type="submit"
                    className={`w-full h-11 font-semibold cursor-pointer shadow-none rounded-xl ${isAdminLogin ? "bg-amber-500 hover:bg-amber-500/90 text-white" : ""}`}
                    disabled={btnDisabled}
                    onClick={handleSubmit}
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    {isAdminLogin ? (
                      codeSent ? (
                        <>
                          <Shield className="w-4 h-4 mr-2" />
                          Подтвердить код
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Отправить код
                        </>
                      )
                    ) : tab === "login" ? (
                      loginStep === 1 ? (
                        <>
                          <ArrowRight className="w-4 h-4 mr-2" />
                          Далее
                        </>
                      ) : codeSent ? (
                        <>
                          <Shield className="w-4 h-4 mr-2" />
                          Подтвердить код
                        </>
                      ) : (
                        <>
                          <LogIn className="w-4 h-4 mr-2" />
                          Войти
                        </>
                      )
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Создать аккаунт
                      </>
                    )}
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
