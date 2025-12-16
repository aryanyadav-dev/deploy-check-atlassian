/**
 * Config Panel UI Component
 *
 * Displays project settings for deployment risk configuration.
 * Includes threshold inputs and analyzer toggle switches.
 *
 * Requirements: 4.1
 */

import ForgeUI, {
  render,
  Fragment,
  Text,
  ProjectSettingsPage,
  useState,
  useEffect,
  Button,
  ButtonSet,
  SectionMessage,
  Form,
  TextField,
  Select,
  Option,
  Checkbox,
  CheckboxGroup,
  Strong,
  Tag,
  TagGroup,
} from '@forge/ui';

// Forge bridge invoke function type
declare function invoke(functionKey: string, payload?: unknown): Promise<unknown>;

/**
 * Available analyzer configuration
 */
interface AnalyzerConfig {
  id: string;
  name: string;
  description: string;
}

/**
 * Project configuration structure
 */
interface ProjectConfig {
  coverageThreshold: number;
  enabledAnalyzers: string[];
  confluenceSpaceKey?: string;
  autoPublish: boolean;
  severityThreshold: string;
}

/**
 * Validation error structure
 */
interface ValidationError {
  field: string;
  message: string;
  value: unknown;
}

/**
 * Config response from resolver
 */
interface ConfigResponse {
  status: 'success' | 'error' | 'validation_error';
  message?: string;
  config?: ProjectConfig;
  availableAnalyzers?: AnalyzerConfig[];
  validationErrors?: ValidationError[];
}

/**
 * Severity options for threshold selection
 */
const SEVERITY_OPTIONS = [
  { value: 'LOW', label: 'Low - Report all findings' },
  { value: 'MEDIUM', label: 'Medium - Report medium and above' },
  { value: 'HIGH', label: 'High - Report high and critical only' },
  { value: 'CRITICAL', label: 'Critical - Report critical only' },
];

/**
 * Validation Errors Display Component
 */
const ValidationErrorsDisplay = ({ errors }: { errors: ValidationError[] }) => {
  if (errors.length === 0) {
    return (
      <Fragment>
        <Text> </Text>
      </Fragment>
    );
  }

  return (
    <SectionMessage title="Validation Errors" appearance="error">
      {errors.map((error, index) => (
        <Text key={index}>
          <Strong>{error.field}:</Strong> {error.message}
        </Text>
      ))}
    </SectionMessage>
  );
};

/**
 * Current Config Display Component
 */
const CurrentConfigDisplay = ({ config }: { config: ProjectConfig }) => {
  return (
    <SectionMessage title="Current Configuration" appearance="info">
      <Text>
        <Strong>Coverage Threshold:</Strong> {config.coverageThreshold}%
      </Text>
      <Text>
        <Strong>Severity Threshold:</Strong> {config.severityThreshold}
      </Text>
      <Text>
        <Strong>Auto Publish:</Strong> {config.autoPublish ? 'Enabled' : 'Disabled'}
      </Text>
      <Text>
        <Strong>Confluence Space:</Strong> {config.confluenceSpaceKey || 'Not configured'}
      </Text>
      <Text>
        <Strong>Enabled Analyzers:</Strong>
      </Text>
      <TagGroup>
        {config.enabledAnalyzers.map((analyzer) => (
          <Tag key={analyzer} text={analyzer} color="blue" />
        ))}
      </TagGroup>
    </SectionMessage>
  );
};

/**
 * Config Edit Form Component
 * Uses Forge UI Form for proper form handling
 */
const ConfigEditForm = ({
  config,
  availableAnalyzers,
  onSubmit,
  isSaving,
}: {
  config: ProjectConfig;
  availableAnalyzers: AnalyzerConfig[];
  onSubmit: (data: Record<string, unknown>) => void;
  isSaving: boolean;
}) => {
  return (
    <Form onSubmit={onSubmit} submitButtonText={isSaving ? 'Saving...' : 'Save Settings'}>
      {/* Coverage Threshold Input - Requirement 4.2 */}
      <TextField
        name="coverageThreshold"
        label="Coverage Threshold (%)"
        defaultValue={String(config.coverageThreshold)}
        description="Files with coverage below this threshold will be flagged (0-100)"
        isRequired
      />

      {/* Severity Threshold Selection */}
      <Select label="Minimum Severity to Report" name="severityThreshold">
        {SEVERITY_OPTIONS.map((option) => (
          <Option
            key={option.value}
            label={option.label}
            value={option.value}
            defaultSelected={config.severityThreshold === option.value}
          />
        ))}
      </Select>

      {/* Confluence Settings */}
      <TextField
        name="confluenceSpaceKey"
        label="Confluence Space Key"
        defaultValue={config.confluenceSpaceKey || ''}
        description="Space key for publishing deployment risk reports (e.g., DEPLOY)"
      />

      {/* Auto Publish Toggle */}
      <CheckboxGroup name="autoPublishGroup" label="Publishing Options">
        <Checkbox
          value="autoPublish"
          label="Auto-publish reports on PR merge"
          defaultChecked={config.autoPublish}
        />
      </CheckboxGroup>

      {/* Analyzer Selection - Requirement 4.1 */}
      <CheckboxGroup name="enabledAnalyzers" label="Enabled Analyzers">
        {availableAnalyzers.map((analyzer) => (
          <Checkbox
            key={analyzer.id}
            value={analyzer.id}
            label={`${analyzer.name} - ${analyzer.description}`}
            defaultChecked={config.enabledAnalyzers.includes(analyzer.id)}
          />
        ))}
      </CheckboxGroup>
    </Form>
  );
};

/**
 * Main Config Panel Component
 * Requirement 4.1: Display a configuration panel
 */
const ConfigPanel = () => {
  const [configData, setConfigData] = useState<ConfigResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  // Load configuration on mount
  useEffect(async () => {
    try {
      const response = (await invoke('getConfig')) as ConfigResponse;
      setConfigData(response);
    } catch {
      setConfigData({
        status: 'error',
        message: 'Failed to load configuration',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle form submission
  const handleFormSubmit = async (formData: Record<string, unknown>) => {
    setIsSaving(true);
    setValidationErrors([]);

    // Parse form data into ProjectConfig
    const updatedConfig: Partial<ProjectConfig> = {
      coverageThreshold: Number(formData.coverageThreshold) || 80,
      severityThreshold: (formData.severityThreshold as string) || 'MEDIUM',
      confluenceSpaceKey: (formData.confluenceSpaceKey as string) || undefined,
      autoPublish: Array.isArray(formData.autoPublishGroup)
        ? formData.autoPublishGroup.includes('autoPublish')
        : false,
      enabledAnalyzers: Array.isArray(formData.enabledAnalyzers)
        ? (formData.enabledAnalyzers as string[])
        : [],
    };

    try {
      const response = (await invoke('saveConfig', updatedConfig)) as ConfigResponse;

      if (response.status === 'validation_error' && response.validationErrors) {
        setValidationErrors(response.validationErrors);
      } else if (response.status === 'success') {
        setConfigData(response);
        setIsEditing(false);
      } else {
        setConfigData(response);
      }
    } catch {
      setConfigData({
        status: 'error',
        message: 'Failed to save configuration',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle resetting configuration to defaults
  const handleResetConfig = async () => {
    setIsSaving(true);
    setValidationErrors([]);

    try {
      const response = (await invoke('resetConfig')) as ConfigResponse;
      setConfigData(response);
      setIsEditing(false);
    } catch {
      setConfigData({
        status: 'error',
        message: 'Failed to reset configuration',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <Fragment>
        <Text>Loading configuration...</Text>
      </Fragment>
    );
  }

  // Error state
  if (configData?.status === 'error') {
    return (
      <Fragment>
        <SectionMessage title="Configuration Error" appearance="error">
          <Text>{configData.message || 'An error occurred loading configuration'}</Text>
        </SectionMessage>
      </Fragment>
    );
  }

  // Success state - display config
  if (configData?.status === 'success' && configData.config) {
    const { config, availableAnalyzers } = configData;

    // View mode
    if (!isEditing) {
      return (
        <Fragment>
          <Text>
            <Strong>Deployment Risk Analyzer Settings</Strong>
          </Text>

          <CurrentConfigDisplay config={config} />

          <ButtonSet>
            <Button text="Edit Settings" onClick={() => setIsEditing(true)} appearance="primary" />
            <Button text="Reset to Defaults" onClick={handleResetConfig} />
          </ButtonSet>
        </Fragment>
      );
    }

    // Edit mode
    return (
      <Fragment>
        <Text>
          <Strong>Edit Deployment Risk Settings</Strong>
        </Text>

        {/* Validation Errors */}
        <ValidationErrorsDisplay errors={validationErrors} />

        {/* Config Edit Form */}
        <ConfigEditForm
          config={config}
          availableAnalyzers={availableAnalyzers || []}
          onSubmit={handleFormSubmit}
          isSaving={isSaving}
        />

        <ButtonSet>
          <Button
            text="Cancel"
            onClick={() => {
              setIsEditing(false);
              setValidationErrors([]);
            }}
          />
        </ButtonSet>
      </Fragment>
    );
  }

  // Initial state - no config loaded
  return (
    <Fragment>
      <SectionMessage title="No Configuration" appearance="info">
        <Text>No configuration found. Click below to set up deployment risk analysis.</Text>
      </SectionMessage>
      <ButtonSet>
        <Button text="Configure Settings" onClick={() => setIsEditing(true)} appearance="primary" />
      </ButtonSet>
    </Fragment>
  );
};

export const run = render(
  <ProjectSettingsPage>
    <ConfigPanel />
  </ProjectSettingsPage>
);
