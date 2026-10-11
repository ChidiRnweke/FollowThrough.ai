import { workspaceReplicaContract } from '../contracts/replica-contract';
import { InMemoryWorkspaceReplica } from './in-memory-replica';

workspaceReplicaContract(() => new InMemoryWorkspaceReplica<string, string>());
