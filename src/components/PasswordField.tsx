import { Checkbox, Stack, TextInput, type TextInputProps } from '@mantine/core';
import { useState } from 'react';

/**
 * Contraseña con "Mostrar contraseña" como casilla con texto
 * (el ojito de solo ícono no se entiende para todos).
 */
export function PasswordField(props: Omit<TextInputProps, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <Stack gap={6}>
      <TextInput {...props} type={visible ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <Checkbox
        size="md"
        label="Mostrar contraseña"
        checked={visible}
        onChange={(e) => setVisible(e.currentTarget.checked)}
      />
    </Stack>
  );
}
