import { ipcRenderer } from 'electron';

const autoFlipStepSelect = document.getElementById('autoFlipStep') as HTMLSelectElement;
const keepAwakeCheckbox = document.getElementById('keepAwake') as HTMLInputElement;
const rememberLastPageCheckbox = document.getElementById('rememberLastPage') as HTMLInputElement;

// 初始化：请求当前设置
ipcRenderer.send('get-settings');

// 接收主进程发来的设置
ipcRenderer.on('send-settings', (_event, settings) => {
  if (settings.autoFlipStep) {
    autoFlipStepSelect.value = settings.autoFlipStep.toString();
  }
  if (settings.keepAwake !== undefined) {
    keepAwakeCheckbox.checked = settings.keepAwake;
  }
  if (settings.rememberLastPage !== undefined) {
    rememberLastPageCheckbox.checked = settings.rememberLastPage;
  }
});

// 监听变更并保存
autoFlipStepSelect.addEventListener('change', () => {
  const step = parseInt(autoFlipStepSelect.value, 10);
  ipcRenderer.send('update-settings', { autoFlipStep: step });
});

keepAwakeCheckbox.addEventListener('change', () => {
  const keep = keepAwakeCheckbox.checked;
  ipcRenderer.send('update-settings', { keepAwake: keep });
});

rememberLastPageCheckbox.addEventListener('change', () => {
  const remember = rememberLastPageCheckbox.checked;
  ipcRenderer.send('update-settings', { rememberLastPage: remember });
});
