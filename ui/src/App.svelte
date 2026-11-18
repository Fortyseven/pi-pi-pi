<script>
  import { onMount } from 'svelte';
  import { S } from './lib/state.svelte.js';
  import TopBar from './components/TopBar.svelte';
  import SessionTabs from './components/SessionTabs.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import PanelGrip from './components/PanelGrip.svelte';
  import MainView from './components/MainView.svelte';
  import RightPanel from './components/RightPanel.svelte';
  import DetailPanel from './components/DetailPanel.svelte';
  import PkgsOverlay from './components/PkgsOverlay.svelte';
  import ProviderPicker from './components/ProviderPicker.svelte';
  import ConfirmBar from './components/ConfirmBar.svelte';
  import FatalBar from './components/FatalBar.svelte';

  onMount(() => S.init());
</script>

<div class="deck" class:no-subs={S.subsHidden}
     style="--sidebar-w: {S.sidebarW}px; --right-w: {S.rightW}px">
  <TopBar />
  <SessionTabs />
  <SettingsModal />
  <Sidebar />
  <PanelGrip side="left" />
  <MainView />
  <PanelGrip side="right" />
  <RightPanel />
  <DetailPanel />
  <PkgsOverlay />
  <ProviderPicker />
  <ConfirmBar />
  <FatalBar />
</div>
