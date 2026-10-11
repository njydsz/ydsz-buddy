/**
 * Expert Marketplace Panel (G11-P2)
 * Provides import/export functionality for expert bundles.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Download, Upload, Share2, CheckCircle2, AlertCircle, Package } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
}

interface ValidationReport {
  valid: boolean;
  expertId: string;
  checks: ValidationCheck[];
  summary: string;
}

interface ExpertImportResult {
  id: string;
  name: string;
  version: string;
  description: string;
  skillCount: number;
}

export function ExpertMarketplacePanel() {
  const [expertId, setExpertId] = useState("");
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const exportMutation = useMutation({
    mutationFn: async (id: string) => {
      const savePath = await save({
        defaultPath: id + ".expert.zip",
        filters: [{ name: "Expert Bundle", extensions: ["zip"] }],
      });
      if (!savePath) throw new Error("Export cancelled");
      await invoke("expert_export", { id, targetPath: savePath });
      return savePath;
    },
    onSuccess: (p: string) => toast.success("Expert exported to " + p),
    onError: (e: unknown) => toast.error("Export failed: " + String(e)),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const selected = await open({
        filters: [{ name: "Expert Bundle", extensions: ["zip"] }],
      });
      if (!selected) throw new Error("Import cancelled");
      type InvokeResult = ExpertImportResult;
      const info = await invoke<InvokeResult>("expert_import", { sourcePath: selected });
      return info;
    },
    onSuccess: (info: ExpertImportResult) => toast.success("Imported: " + info.name + " (" + info.skillCount + " skills)"),
    onError: (e: unknown) => toast.error("Import failed: " + String(e)),
  });

  const handleValidate = async () => {
    if (!expertId.trim()) { toast.error("Please enter an expert ID"); return; }
    setIsValidating(true);
    try {
      type VR = ValidationReport;
      const report = await invoke<VR>("expert_validate", { id: expertId });
      setValidationReport(report);
    } catch (e: unknown) { toast.error("Validation failed: " + String(e)); }
    finally { setIsValidating(false); }
  };

  const handleShare = async () => {
    if (!expertId.trim()) { toast.error("Please enter an expert ID"); return; }
    try {
      type SR = string;
      const link = await invoke<SR>("expert_share_link", { id: expertId });
      await navigator.clipboard.writeText(link);
      toast.success("Share link copied to clipboard");
    } catch (e: unknown) { toast.error("Share failed: " + String(e)); }
  };

  const checks: ValidationCheck[] = validationReport?.checks || [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Package className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Expert Marketplace</h2>
      </div>
      <p className="text-sm text-muted-foreground">Import and export expert bundles. Local file sharing only (v1).</p>
      <div className="space-y-2">
        <Label htmlFor="em-expert-id">Expert ID</Label>
        <Input id="em-expert-id" placeholder="Enter expert identifier..." value={expertId} onChange={(e) => setExpertId(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => exportMutation.mutate(expertId)} disabled={!expertId.trim() || exportMutation.isPending}>
          {exportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export
        </Button>
        <Button variant="outline" onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
          {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import
        </Button>
        <Button variant="outline" onClick={handleShare} disabled={!expertId.trim()}><Share2 className="h-4 w-4" /> Share</Button>
        <Button variant="outline" onClick={handleValidate} disabled={!expertId.trim() || isValidating}>
          {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Validate
        </Button>
      </div>
      {validationReport && (
        <Card className="mt-4">
          <CardHeader><CardTitle className="text-sm">Validation Report</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm font-medium">{validationReport.summary}</p>
            <div className="space-y-1">
              {checks.map((check: ValidationCheck, idx: number) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  {check.passed ? <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" /> : <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
                  <span className="text-muted-foreground">{check.name}:</span><span>{check.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
