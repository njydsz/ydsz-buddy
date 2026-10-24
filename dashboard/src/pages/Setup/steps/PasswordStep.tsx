import { useEffect, useState } from "react";
import { Form, Input, Button, Alert, Typography } from "antd";
import { Lock, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";

import { authApi } from "../../../api/modules/auth";
import { wizardApi, wizardSession } from "../wizardClient";
import { apiErrorMessage } from "../../../utils/apiError";
import styles from "../setup.module.less";

const { Text, Paragraph } = Typography;

interface Props {
  onVerified: () => void;
}

export default function PasswordStep({ onVerified }: Props) {
  const { t } = useTranslation();
  const [form] = Form.useForm<{ password: string }>();
  const [submitting, setSubmitting] = useState(false);
  const [fileExists, setFileExists] = useState<boolean | null>(null);
  const [passwordPath, setPasswordPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authApi
      .getAuthStatus()
      .then((s) => {
        setFileExists(s.wizard_password_exists);
        setPasswordPath(s.wizard_password_path ?? null);
      })
      .catch(() => setFileExists(null));
  }, []);

  const onFinish = async (values: { password: string }) => {
    setError(null);
    setSubmitting(true);
    try {
      const r = await wizardApi.verifyPassword(values.password);
      wizardSession.saveToken(r.wizard_token);
      onVerified();
    } catch (e) {
      setError(apiErrorMessage(e, t("wizard.password.wrong"), t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.passwordStepInner}>
      <div className={styles.passwordStepHeader}>
        <div className={styles.passwordStepTitle}>
          {t("wizard.stepPassword")}
        </div>
        <Text type="secondary" className={styles.passwordStepHint}>
          {t("wizard.password.hint")}
        </div>
      </div>

      <Alert
        type="info"
        showIcon
        icon={<Terminal size={16} />}
        className={styles.passwordStepAlert}
        message={t("wizard.password.whereTitle")}
        description={
          <Paragraph style={{ marginBottom: 0, fontSize: 12.5 }}>
            {passwordPath
              ? t("wizard.password.wherePath", { path: passwordPath })
              : t("wizard.password.whereDefault")}
          </Paragraph>
        }
      />

      {fileExists === false && (
        <Alert
          type="warning"
          showIcon
          className={styles.passwordStepAlert}
          message={t("wizard.password.missingFile")}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        requiredMark={false}
        className={styles.passwordStepForm}
      >
        <Form.Item
          label={t("wizard.password.label")}
          name="password"
          rules={[
            { required: true, message: t("wizard.password.label") as string },
          ]}
        >
          <Input.Password
            prefix={<Lock size={16} />}
            autoFocus
            autoComplete="off"
          />
        </Form.Item>

        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            className={styles.passwordStepAlert}
          />
        )}

        <Button
          type="primary"
          htmlType="submit"
          block
          size="large"
          loading={submitting}
        >
          {t("wizard.password.verifyButton")}
        </Button>
      </Form>
    </div>
  );
}
