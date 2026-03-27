"use client";

import { useEffect, useState } from "react";

import {
  Server,
  Activity,
  Power,
  PowerOff,
  ShieldCheck,
  Edit,
  Trash2,
  MapPin,
  Link,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/api/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader } from "@/components/ui/loader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface VpnServer {
  id: string;
  ip: string;
  hostname?: string | null;
  port: number;
  supportedProtocols: string[];
  serverType: string;
  currentLoad: number;
  status: string;
  location: string;
  connectLinkTemplate: string | null;
  lastSeenAt?: string;
}

export default function AdminServersPage() {
  const { user } = useAuth();
  const [servers, setServers] = useState<VpnServer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.isAdmin) {
      fetchServers();
    }
  }, [user]);

  const fetchServers = async () => {
    try {
      const data = await apiClient.get<VpnServer[]>("/admin/server/list");
      setServers(data);
    } catch (error) {
      console.error("Failed to fetch servers", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: string, data: Partial<VpnServer>) => {
    try {
      await apiClient.patch(`/admin/server/${id}`, data);
      await fetchServers();
    } catch (error) {
      console.error("Failed to update server", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Вы уверены, что хотите удалить этот сервер?")) return;
    try {
      await apiClient.delete(`/admin/server/${id}`);
      await fetchServers();
    } catch (error) {
      console.error("Failed to delete server", error);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <Server className="w-8 h-8 text-primary" />
            VPN Серверы
          </h1>
          <p className="text-muted-foreground">
            Управление доступными VPN серверами, мониторинг нагрузки и
            протоколов.
          </p>
        </div>
        <Button
          onClick={fetchServers}
          variant="outline"
          className="rounded-xl gap-2 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Обновить
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[100px]">Статус</TableHead>
              <TableHead>Локация / IP</TableHead>
              <TableHead>Протоколы</TableHead>
              <TableHead>Нагрузка</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {servers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-32 text-center text-muted-foreground"
                >
                  Серверы не найдены
                </TableCell>
              </TableRow>
            ) : (
              servers.map((server) => (
                <TableRow key={server.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${
                          server.status === "online"
                            ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)] animate-pulse"
                            : "bg-red-500"
                        }`}
                      />
                      <span className="font-medium capitalize">
                        {server.status}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <div className="font-bold text-foreground flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                        {server.location || "Неизвестно"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                        {server.hostname ? `${server.hostname} (${server.ip})` : server.ip}:{server.port}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {server.supportedProtocols?.map((proto) => (
                        <Badge
                          key={proto}
                          variant="secondary"
                          className="text-[10px] uppercase font-black tracking-wider px-1.5 py-0"
                        >
                          {proto}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 bg-muted/50 w-fit px-2 py-1 rounded-lg border border-border/50">
                      <Activity className="w-3.5 h-3.5 text-primary" />
                      <span className="font-bold text-sm">
                        {server.currentLoad}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <EditServerDialog
                        server={server}
                        onUpdate={(data) => handleUpdate(server.id, data)}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer"
                        onClick={() => handleDelete(server.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EditServerDialog({
  server,
  onUpdate,
}: {
  server: VpnServer;
  onUpdate: (data: Partial<VpnServer>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState(server.location);
  const [hostname, setHostname] = useState(server.hostname || "");
  const [template, setTemplate] = useState(server.connectLinkTemplate || "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate({ location, hostname: hostname || null, connectLinkTemplate: template || null });
      toast.success("Сервер обновлен");
      setOpen(false);
    } catch {
      toast.error("Ошибка обновления");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg cursor-pointer"
        >
          <Edit className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[900px] w-[95vw] max-h-[95vh] overflow-y-auto p-0 border-none bg-transparent shadow-none">
        <div className="bg-card border border-border/50 rounded-[2rem] shadow-2xl overflow-hidden">
          <div className="p-8 md:p-12">
            <DialogHeader className="mb-8">
              <DialogTitle className="text-3xl font-black tracking-tight flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-primary/10 text-primary">
                  <Server className="w-6 h-6" />
                </div>
                Редактирование сервера
              </DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-8 py-4">
              <div className="space-y-3">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground/60 ml-1">
                  Локация (будет видна пользователю)
                </Label>
                <div className="relative group">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Frankfurt, Germany"
                    className="rounded-2xl h-14 pl-12 bg-muted/30 border-border/50 focus:bg-background transition-all text-lg font-medium"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground/60 ml-1">
                  Hostname / домен сервера
                </Label>
                <div className="relative group">
                  <Link className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value)}
                    placeholder="s1.lowkey.su"
                    className="rounded-2xl h-14 pl-12 bg-muted/30 border-border/50 focus:bg-background transition-all text-lg font-medium"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground/60 ml-1">
                  Шаблон ссылки подключения (vless://...)
                </Label>
                <div className="relative group">
                  <Link className="absolute left-4 top-5 w-5 h-5 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Textarea
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    placeholder="vless://{uuid}@{host}:443?..."
                    className="rounded-[1.5rem] min-h-[160px] pl-12 pt-4 bg-muted/30 border-border/50 focus:bg-background transition-all font-mono text-sm leading-relaxed resize-none"
                  />
                </div>
                <div className="flex items-center gap-4 px-2">
                  <p className="text-[11px] font-bold text-muted-foreground/50 uppercase tracking-wider">
                    Доступные переменные:
                  </p>
                  <div className="flex gap-2">
                    <code className="px-2 py-0.5 rounded-md bg-primary/5 text-primary text-[10px] font-black border border-primary/10">
                      {`{uuid}`}
                    </code>
                    <code className="px-2 py-0.5 rounded-md bg-primary/5 text-primary text-[10px] font-black border border-primary/10">
                      {`{ip}`}
                    </code>
                    <code className="px-2 py-0.5 rounded-md bg-primary/5 text-primary text-[10px] font-black border border-primary/10">
                      {`{host}`}
                    </code>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-10 gap-3">
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                className="rounded-2xl px-8 h-12 font-bold hover:bg-muted transition-colors cursor-pointer"
              >
                Отмена
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="rounded-2xl px-10 h-12 font-black shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all cursor-pointer bg-primary text-primary-foreground"
              >
                {isSaving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  "Сохранить"
                )}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
