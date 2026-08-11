import { StackActions, useNavigation } from "@react-navigation/native";
import { useCallback, useMemo, useSyncExternalStore, type PropsWithChildren } from "react";

import { T3KeyboardCommands } from "../../native/T3KeyboardCommands";
import { useEnvironmentServerConfig } from "../../state/entities";
import {
  dispatchHardwareKeyboardCommand,
  getHardwareKeyboardCommandRegistrationVersion,
  getRegisteredHardwareKeyboardCommands,
  parseActiveThreadPath,
  subscribeToHardwareKeyboardCommandRegistrations,
  type HardwareKeyboardCommand,
} from "./hardwareKeyboardCommands";

export function HardwareKeyboardCommandProvider({
  children,
  pathname,
}: PropsWithChildren<{ readonly pathname: string }>) {
  const navigation = useNavigation();
  const activeThread = useMemo(() => parseActiveThreadPath(pathname), [pathname]);
  const serverConfig = useEnvironmentServerConfig(activeThread?.environmentId ?? null);
  const registrationVersion = useSyncExternalStore(
    subscribeToHardwareKeyboardCommandRegistrations,
    getHardwareKeyboardCommandRegistrationVersion,
    getHardwareKeyboardCommandRegistrationVersion,
  );
  const enabledCommands = useMemo(() => {
    const commands = new Set<HardwareKeyboardCommand>(getRegisteredHardwareKeyboardCommands());
    commands.add("newTask");
    if (pathname !== "/" || navigation.canGoBack()) commands.add("back");
    if (activeThread) {
      commands.add("files");
      commands.add("terminal");
      commands.add("review");
    }
    return [...commands];
  }, [activeThread, pathname, registrationVersion, navigation]);

  const onCommand = useCallback(
    (command: HardwareKeyboardCommand) => {
      if (dispatchHardwareKeyboardCommand(command)) return;

      if (command === "newTask") {
        navigation.navigate("NewTaskSheet", { screen: "NewTask" });
        return;
      }
      if (command === "back") {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.dispatch(StackActions.replace("Home"));
        }
        return;
      }

      const thread = activeThread;
      if (!thread) return;
      if (command === "files" && !/\/files(?:\/|$)/.test(pathname)) {
        navigation.navigate("ThreadFiles", thread);
      }
      if (command === "terminal" && !/\/terminal(?:\/|$)/.test(pathname)) {
        navigation.navigate("ThreadTerminal", thread);
      }
      if (command === "review" && !/\/(?:changes|review)(?:\/|$)/.test(pathname)) {
        navigation.navigate(
          serverConfig?.environment.capabilities.vcsChanges === true
            ? "ThreadChanges"
            : "ThreadReview",
          thread,
        );
      }
    },
    [activeThread, navigation, pathname, serverConfig],
  );

  return (
    <T3KeyboardCommands enabledCommands={enabledCommands} onCommand={onCommand}>
      {children}
    </T3KeyboardCommands>
  );
}
