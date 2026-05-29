export enum TaskStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  IN_PROGRESS = 'in_progress',
}

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
  constructor(private taskList: Task[] = []) {}

  public hasIncompleteTasks(): boolean {
    if (this.taskList.length === 0) return false;

    return this.taskList.some(t => t.status !== TaskStatus.COMPLETED);
  }

  public get hasTasks() {
    return this.taskList.length > 0;
  }

  public get tasks(): Task[] {
    return this.taskList;
  }

  public updateTasks(updates: TaskUpdate[]): Task[] {
    if (!this.hasTasks) {
      throw new Error('No task list exists.');
    }

    updates.forEach((update: TaskUpdate) => {
      const task = this.taskList.find(t => t.id === update.id);
      if (!task) {
        throw new Error(`No task with id "${update.id}" exists in the task list.`);
      }
      task.status = update.status;
    });

    return this.tasks;
  }

  public set(tasks: Task[]): Task[] {
    this.taskList = tasks;
    return this.taskList;
  }

  public clear(): void {
    this.taskList = [];
  }
}
