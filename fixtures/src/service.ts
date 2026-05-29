// service — imported by 5 consumers (branch)
import { formatDate } from "./utils.js";

export class DataService {
  get(id: string): string {
    return `${id}:${formatDate(new Date())}`;
  }
}
