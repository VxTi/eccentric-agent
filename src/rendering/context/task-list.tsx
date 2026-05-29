import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useState,
} from 'react';
import { type Task, TaskStatus } from '../../lib/tasks';

export interface TaskUpdate {
  id: string;
  status: TaskStatus;
}
export interface TaskList {
  tasks: Task[];
  setTasks: Dispatch<SetStateAction<Task[]>>;
  update: (updates: TaskUpdate[]) => Task[];
  hasIncompleteTasks: boolean;
  hasTasks: boolean;
}

const TaskContext = createContext<TaskList | undefined>(undefined);

export function useTaskList(): TaskList {
  const list = useContext(TaskContext);
  if (!list) throw new Error('useTaskList must be used within tasks');

  return list;
}

export function TaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);

  const hasTasks = tasks.length > 0;

  const hasIncompleteTasks = hasTasks && tasks.some(t => t.status !== TaskStatus.COMPLETED);

  const update = useCallback(
    (updates: TaskUpdate[]) => {
      if (!hasTasks) {
        throw new Error('No task list exists.');
      }

      updates.forEach((update: TaskUpdate) => {
        const task = tasks.find(t => t.id === update.id);
        if (!task) {
          throw new Error(`No task with id "${update.id}" exists in the task list.`);
        }
        task.status = update.status;
      });

      return tasks;
    },
    [hasTasks, tasks]
  );

  return (
    <TaskContext.Provider
      value={{
        hasTasks,
        tasks,
        setTasks,
        update,
        hasIncompleteTasks,
      }}
    >
      {children}
    </TaskContext.Provider>
  );
}
