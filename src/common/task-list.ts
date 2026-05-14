export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
}

export interface TaskUpdate {
  id: string;
  status: TaskStatus;
}

export class TaskList {
  private _taskList: Task[];

  constructor(taskList: Task[] = []) {
    this._taskList = taskList;
  }

  public hasIncompleteTasks(): boolean {
    if (this._taskList.length === 0) return false;

    return this._taskList.some(task => task.status !== 'completed');
  }

  public get hasTasks() {
    return this._taskList.length > 0;
  }

  public get tasks(): Task[] {
    return this._taskList;
  }

  public updateTasks(updates: TaskUpdate[]): Task[] {
    if (!this.hasTasks) {
      throw new Error('No task list exists.');
    }

    for (const update of updates) {
      const task = this._taskList.find(t => t.id === update.id);
      if (!task) {
        throw new Error(
          `No task with id "${update.id}" exists in the task list.`
        );
      }
      task.status = update.status;
    }

    return this.tasks;
  }

  public set(tasks: Task[]): Task[] {
    this._taskList = tasks;
    return this._taskList;
  }

  public clear(): void {
    this._taskList = [];
  }
}
