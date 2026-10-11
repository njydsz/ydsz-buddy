/**
 * @file WorkflowView - Dynamic Workflow Engine UI
 * @description Template gallery, instance management, and DAG timeline visualization
 */

import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types mirroring the Rust backend
// ---------------------------------------------------------------------------

interface WorkflowNode {
  id: string;
  name: string;
  node_type: string;
  depends_on: string[];
  status: string;
  output: unknown;
  error?: string;
  started_at?: string;
  finished_at?: string;
}

interface WorkflowInstance {
  id: string;
  template_id: string;
  template_name: string;
  status: string;
  nodes: WorkflowNode[];
  created_at: string;
  started_at?: string;
  finished_at?: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  nodes: WorkflowNode[];
  tags: string[];
  inputs: Array<{ name: string; description: string; required: boolean }>;
}

// ---------------------------------------------------------------------------
// Mock data (TBD: replace with real invoke calls once IPC is wired)
// ---------------------------------------------------------------------------

const MOCK_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'builtin-code-review',
    name: '代码审查流水线',
    description: '自动审查代码质量、修复问题、运行测试、提 PR',
    version: '1.0.0',
    tags: ['git', 'code-review', 'pr'],
    nodes: [
      { id: 'analyze', name: '代码分析', node_type: 'agent_task', depends_on: [], status: 'pending' },
      { id: 'fix', name: '自动修复', node_type: 'agent_task', depends_on: ['analyze'], status: 'pending' },
      { id: 'test', name: '运行测试', node_type: 'tool_call', depends_on: ['fix'], status: 'pending' },
      { id: 'confirm_pr', name: '确认提 PR', node_type: 'human_gate', depends_on: ['test'], status: 'pending' },
      { id: 'create_pr', name: '创建 PR', node_type: 'agent_task', depends_on: ['confirm_pr'], status: 'pending' },
    ],
    inputs: [
      { name: 'code_path', description: '要审查的文件或目录路径', required: true },
      { name: 'language', description: '编程语言', required: false },
    ],
  },
  {
    id: 'builtin-docs-gen',
    name: '文档自动生成',
    description: '扫描代码生成 API 文档、README 和使用示例',
    version: '1.0.0',
    tags: ['docs', 'automation'],
    nodes: [
      { id: 'scan', name: '代码扫描', node_type: 'agent_task', depends_on: [], status: 'pending' },
      { id: 'gen-api', name: 'API 文档', node_type: 'agent_task', depends_on: ['scan'], status: 'pending' },
      { id: 'gen-readme', name: 'README 更新', node_type: 'agent_task', depends_on: ['scan'], status: 'pending' },
      { id: 'write-files', name: '写入文档', node_type: 'tool_call', depends_on: ['gen-api', 'gen-readme'], status: 'pending' },
    ],
    inputs: [
      { name: 'source_dir', description: '源码目录', required: true },
    ],
  },
];

const MOCK_INSTANCES: WorkflowInstance[] = [];

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'text-green-500';
    case 'running': return 'text-blue-500';
    case 'failed': return 'text-red-500';
    case 'paused': return 'text-yellow-500';
    case 'pending': return 'text-gray-400';
    default: return 'text-gray-400';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'completed': return '已完成';
    case 'running': return '运行中';
    case 'failed': return '失败';
    case 'paused': return '已暂停';
    case 'pending': return '待执行';
    default: return status;
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkflowView() {
  const [activeTab, setActiveTab] = useState<'templates' | 'instances'>('templates');
  const [templates] = useState<WorkflowTemplate[]>(MOCK_TEMPLATES);
  const [instances, setInstances] = useState<WorkflowInstance[]>(MOCK_INSTANCES);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<WorkflowInstance | null>(null);

  const handleCreateInstance = useCallback(async (tpl: WorkflowTemplate) => {
    // TBD: invoke workflow_instance_create
    const instance: WorkflowInstance = {
      id: `inst-${Date.now()}`,
      template_id: tpl.id,
      template_name: tpl.name,
      status: 'running',
      nodes: tpl.nodes.map(n => ({ ...n })),
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    };
    setInstances(prev => [instance, ...prev]);
    setSelectedInstance(instance);
    setActiveTab('instances');
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b">
        <h1 className="text-lg font-semibold">Dynamic Workflow</h1>
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-3 py-1.5 text-sm rounded ${activeTab === 'templates' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
          >
            模板
          </button>
          <button
            onClick={() => setActiveTab('instances')}
            className={`px-3 py-1.5 text-sm rounded ${activeTab === 'instances' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
          >
            实例 ({instances.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'templates' && (
          <TemplateGallery
            templates={templates}
            onSelect={setSelectedTemplate}
            onCreateInstance={handleCreateInstance}
          />
        )}
        {activeTab === 'instances' && (
          <InstanceList
            instances={instances}
            selected={selectedInstance}
            onSelect={setSelectedInstance}
          />
        )}
      </div>

      {/* Detail side panel */}
      {selectedTemplate && activeTab === 'templates' && (
        <TemplateDetail
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onCreateInstance={handleCreateInstance}
        />
      )}
      {selectedInstance && activeTab === 'instances' && (
        <InstanceTimeline
          instance={selectedInstance}
          onClose={() => setSelectedInstance(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TemplateGallery({
  templates,
  onSelect,
  onCreateInstance,
}: {
  templates: WorkflowTemplate[];
  onSelect: (t: WorkflowTemplate) => void;
  onCreateInstance: (t: WorkflowTemplate) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {templates.map(tpl => (
        <div
          key={tpl.id}
          className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => onSelect(tpl)}
        >
          <div className="flex items-start justify-between">
            <h3 className="font-medium">{tpl.name}</h3>
            <span className="text-xs bg-secondary px-2 py-0.5 rounded">v{tpl.version}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{tpl.description}</p>
          <div className="flex flex-wrap gap-1 mt-3">
            {tpl.tags.map(tag => (
              <span key={tag} className="text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-muted-foreground">{tpl.nodes.length} 步骤</span>
            <button
              className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded"
              onClick={(e) => {
                e.stopPropagation();
                onCreateInstance(tpl);
              }}
            >
              运行
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TemplateDetail({
  template,
  onClose,
  onCreateInstance,
}: {
  template: WorkflowTemplate;
  onClose: () => void;
  onCreateInstance: (t: WorkflowTemplate) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-auto p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{template.name}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <p className="text-muted-foreground mt-2">{template.description}</p>

        <h3 className="font-medium mt-4">步骤 DAG</h3>
        <div className="mt-2 space-y-2">
          {template.nodes.map((node, i) => (
            <div key={node.id} className="flex items-center gap-3 p-2 rounded bg-secondary/50">
              <span className="text-xs bg-secondary rounded-full w-6 h-6 flex items-center justify-center">
                {i + 1}
              </span>
              <span className="text-sm">{node.name}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {node.depends_on.length > 0 ? `依赖: ${node.depends_on.join(', ')}` : '入口'}
              </span>
            </div>
          ))}
        </div>

        {template.inputs.length > 0 && (
          <>
            <h3 className="font-medium mt-4">输入参数</h3>
            <div className="mt-2 space-y-1">
              {template.inputs.map(input => (
                <div key={input.name} className="flex items-center gap-2 text-sm">
                  <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">{input.name}</code>
                  <span className="text-muted-foreground">{input.description}</span>
                  {input.required && <span className="text-xs text-red-500">*必填</span>}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded">关闭</button>
          <button
            onClick={() => onCreateInstance(template)}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded"
          >
            创建实例
          </button>
        </div>
      </div>
    </div>
  );
}

function InstanceList({
  instances,
  selected,
  onSelect,
}: {
  instances: WorkflowInstance[];
  selected: WorkflowInstance | null;
  onSelect: (i: WorkflowInstance) => void;
}) {
  if (instances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p>暂无运行实例</p>
        <p className="text-sm mt-1">选择一个模板来创建工作流实例</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {instances.map(inst => (
        <div
          key={inst.id}
          className={`border rounded-lg p-4 cursor-pointer transition-shadow ${selected?.id === inst.id ? 'ring-2 ring-primary' : 'hover:shadow-sm'}`}
          onClick={() => onSelect(inst)}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">{inst.template_name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{inst.id.slice(0, 8)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${getStatusColor(inst.status)}`}>
                {getStatusLabel(inst.status)}
              </span>
              <span className="text-xs text-muted-foreground">
                {inst.nodes.filter(n => n.status === 'completed').length}/{inst.nodes.length}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function InstanceTimeline({
  instance,
  onClose,
}: {
  instance: WorkflowInstance;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-auto p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{instance.template_name}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>

        <div className="mt-4 space-y-0">
          {instance.nodes.map((node, i) => (
            <div key={node.id} className="flex gap-4">
              {/* Timeline rail */}
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full border-2 ${node.status === 'completed' ? 'bg-green-500 border-green-500' : node.status === 'running' ? 'bg-blue-500 border-blue-500 animate-pulse' : node.status === 'failed' ? 'bg-red-500 border-red-500' : 'bg-background border-muted-foreground'}`} />
                {i < instance.nodes.length - 1 && (
                  <div className="w-0.5 h-12 bg-muted-foreground/30" />
                )}
              </div>
              {/* Node content */}
              <div className="flex-1 pb-8">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{node.name}</span>
                  <span className={`text-xs ${getStatusColor(node.status)}`}>
                    {getStatusLabel(node.status)}
                  </span>
                </div>
                {node.error && (
                  <p className="text-xs text-red-500 mt-1">{node.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded">关闭</button>
        </div>
      </div>
    </div>
  );
}
