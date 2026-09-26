# Domain assessment stack landing

The remaining assessment stack is consolidated for one integration review and CI run.
PR #71 merged separately. The 139 PRs below retain their original problem statements,
regressions and screenshot evidence; their code is replayed in dependency order on top of
master at `2d79ee63`. The original stack tip is `78bed6e627a6e0af9ead54c98798dd4a2e0e9f0a`.

Every original patch applied without a content conflict. The combined source also retains
master's later tool-failure advice and Markdown parsing fixes from PR #155, CI changes from
PRs #149/#153 and release-managed metadata. No release is cut by this integration.

Integration delivery is separate from assessment completion. At this snapshot, 20 of 411
workflow reviews are recorded complete: all 18 task workflows and two skill workflows.
The remaining unchecked items need current-source dispositions; they are not evidence that
their implementations are absent. Reconcile existing fixes before adding new changes.

The integration PR records final validation and merge status. Superseded PRs are closed only
after their combined implementation lands. Original branches and other agents' worktrees
remain available; this landing does not delete them.

## Included PRs

| PR                                                               | Original head                              | Change                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| [#72](https://github.com/ChidiRnweke/FollowThrough.ai/pull/72)   | `d8b624888448c0bdd7946ac3ae7b07bf831f1c2c` | refactor(diagrams): coordinate draw.io save steps in request handlers                       |
| [#73](https://github.com/ChidiRnweke/FollowThrough.ai/pull/73)   | `89bb8815943304b8e5ddb568a5aa4f96d9e96b84` | refactor(attachments): coordinate text extraction and image description in request handlers |
| [#74](https://github.com/ChidiRnweke/FollowThrough.ai/pull/74)   | `579c6845c21eab8a5d42af6868e0f26d3faef858` | fix(todos): report automatically accepted task proposals accurately                         |
| [#75](https://github.com/ChidiRnweke/FollowThrough.ai/pull/75)   | `7f4328042d78b35a9f93e0fe86b84a1a08e1a2bc` | refactor(suggestions): apply accepted changes from the request handler                      |
| [#76](https://github.com/ChidiRnweke/FollowThrough.ai/pull/76)   | `b9701f1ea51a1d69e4f4698ef676b3f5c9b8ce08` | fix(telemetry): record controller work under the right trace span                           |
| [#77](https://github.com/ChidiRnweke/FollowThrough.ai/pull/77)   | `3c13908ce377f40b2355b64fb8724a21711f99d3` | fix(search): reject blank generated search queries                                          |
| [#78](https://github.com/ChidiRnweke/FollowThrough.ai/pull/78)   | `b212f39d7b2f9ff398d42c0cf5ea95ecafec8608` | fix(agent): replay past chats correctly after unreadable saved events                       |
| [#79](https://github.com/ChidiRnweke/FollowThrough.ai/pull/79)   | `10f80cc1691412977c11f1b85e0f708d03d7aae8` | fix(agent): cancel image descriptions and free provider resources                           |
| [#80](https://github.com/ChidiRnweke/FollowThrough.ai/pull/80)   | `545f07ff59d669192ea3b81b21fdc71ce9d7357b` | refactor(auth): manage one session lifecycle for sign-in and requests                       |
| [#81](https://github.com/ChidiRnweke/FollowThrough.ai/pull/81)   | `aab1e61ff0a60de828b81de92e85001fc08499a8` | fix(memory): reject proposals that target the wrong scope                                   |
| [#82](https://github.com/ChidiRnweke/FollowThrough.ai/pull/82)   | `5e673c6d9db745a03f80376134b234012d8bf906` | fix(todos): save a task edit in one write and persist cleared fields                        |
| [#83](https://github.com/ChidiRnweke/FollowThrough.ai/pull/83)   | `1a3e86bf6df92b7f13d34cd2e752981642d4c3ea` | fix(todos): commit task batches atomically with a stable request id                         |
| [#84](https://github.com/ChidiRnweke/FollowThrough.ai/pull/84)   | `986645d6dfcb351a06c7ea3b5c6cad3613bd77ea` | fix(chat): attach every note when a folder is mentioned                                     |
| [#85](https://github.com/ChidiRnweke/FollowThrough.ai/pull/85)   | `8ea627d82680370929f9aabd5cd204e1c42daec2` | fix(chat): keep same-named mentions tied to their chosen resources                          |
| [#86](https://github.com/ChidiRnweke/FollowThrough.ai/pull/86)   | `af6fe5eccb8663939d7809dd41fe74a81c95b589` | fix(search): index complete attachments and repair truncated results                        |
| [#87](https://github.com/ChidiRnweke/FollowThrough.ai/pull/87)   | `f23689c0499cb6d2f3b6177013e15a1bfc8a2490` | fix(templates): publish uploads only after their contents are verified                      |
| [#88](https://github.com/ChidiRnweke/FollowThrough.ai/pull/88)   | `936aeeef9092bc59c81a22b9b95cd42bc51d67b4` | fix(imports): resolve archive links by path and report blocked folders                      |
| [#89](https://github.com/ChidiRnweke/FollowThrough.ai/pull/89)   | `c00a550f6741bf178774d397607b362d07fe2912` | fix(diagrams): commit draft and trash changes with their search index                       |
| [#90](https://github.com/ChidiRnweke/FollowThrough.ai/pull/90)   | `92fc6aa7d033ca8007d1f84e4e6d27606e18980f` | fix(notes): report partial text replacements and roll back failed server batches            |
| [#91](https://github.com/ChidiRnweke/FollowThrough.ai/pull/91)   | `29bd8eb1e557fd1919d6e249b27d1525f074ca53` | fix(settings): limit auto-accept controls to extracted tasks and memory changes             |
| [#92](https://github.com/ChidiRnweke/FollowThrough.ai/pull/92)   | `3aaf1cc6f12a077b83500f9c9c25513296d49667` | fix(notes): embed copied images and diagrams and report missing media                       |
| [#93](https://github.com/ChidiRnweke/FollowThrough.ai/pull/93)   | `fb44ac0c84d1beff7e73ab7b01af0c39eff6926b` | fix(workbench): keep saved tabs separate for each account                                   |
| [#94](https://github.com/ChidiRnweke/FollowThrough.ai/pull/94)   | `b2ea84815357f767baabaa2a14ac164822affb75` | refactor(workspace): share one rule for Today groups and memory counts                      |
| [#95](https://github.com/ChidiRnweke/FollowThrough.ai/pull/95)   | `4b588ec2ecc02a192a556f2afe7a3fd4735c5805` | refactor(suggestions): expire proposals explicitly before review reads                      |
| [#96](https://github.com/ChidiRnweke/FollowThrough.ai/pull/96)   | `9d97d1e0e945d68ed230f59d697da55a180b726b` | fix(templates): accept completion after a concurrent request publishes                      |
| [#97](https://github.com/ChidiRnweke/FollowThrough.ai/pull/97)   | `1eb11f5e447c0d46abcd8f650f86c524884e4a94` | refactor(relationships): find related notes from the request handler                        |
| [#98](https://github.com/ChidiRnweke/FollowThrough.ai/pull/98)   | `980a984a74cde2fa4ff7b915d8537a075165183c` | fix(search): advance embedding work past persistently failing sources                       |
| [#99](https://github.com/ChidiRnweke/FollowThrough.ai/pull/99)   | `9a4a991d0bc143d631c411a327b1b49df8586af1` | refactor(editor): move markdown rendering and proofreading rules out of values              |
| [#100](https://github.com/ChidiRnweke/FollowThrough.ai/pull/100) | `2908a18ea30b527ddb5b103929d8aa4241b9d65a` | refactor(workspace): share pending-write review rules between browser and server            |
| [#101](https://github.com/ChidiRnweke/FollowThrough.ai/pull/101) | `e49f8e440790211f4fd937c155e4eb2b7c463ccd` | refactor(feedback): state clearly when a report is actually stored                          |
| [#102](https://github.com/ChidiRnweke/FollowThrough.ai/pull/102) | `0f1ecaa5b526051122a2dd31820fbc595b13c3dc` | fix(agent): stop requests when an attached note is missing                                  |
| [#103](https://github.com/ChidiRnweke/FollowThrough.ai/pull/103) | `f72110dbbb2c4ee164994e566c370307ed712ca8` | refactor(ui): move sidebar, export and model-picker rules out of values                     |
| [#104](https://github.com/ChidiRnweke/FollowThrough.ai/pull/104) | `00dcd86911bb4f08f777509b8e61bc631b2a4a88` | fix(agent): reject malformed tool events from the provider                                  |
| [#105](https://github.com/ChidiRnweke/FollowThrough.ai/pull/105) | `0dd77c64b79d3d26a03b5e670fa54b65667a1a3a` | refactor(agent): decode stored run state when it is read from the database                  |
| [#106](https://github.com/ChidiRnweke/FollowThrough.ai/pull/106) | `a3092561e7ac52d6967f56589f1e806fbcc62a80` | refactor(exports): generate documents from the request handler                              |
| [#107](https://github.com/ChidiRnweke/FollowThrough.ai/pull/107) | `f3cfa60255c5eccdcbacf9cdc2ebe3259d48f664` | fix(exports): keep the selected diagram palette through export settings                     |
| [#108](https://github.com/ChidiRnweke/FollowThrough.ai/pull/108) | `28e90207e0a9fea9baeb6fac860470b3ec42dc39` | fix(exports): render current diagrams in generated documents                                |
| [#109](https://github.com/ChidiRnweke/FollowThrough.ai/pull/109) | `1389c5fe212a425f345b5bdc9b9e44b9020e00b5` | refactor(search): run knowledge and inline retrieval from the request handler               |
| [#110](https://github.com/ChidiRnweke/FollowThrough.ai/pull/110) | `a9aad0a8a631da13a1b3a08a620547c48db98330` | refactor(search): run embedding backfill from the scheduled handler                         |
| [#111](https://github.com/ChidiRnweke/FollowThrough.ai/pull/111) | `ca7f6e30b3bb519edf2a5f05b637df29a4e8da0c` | refactor(search): coordinate content indexing from request handlers                         |
| [#112](https://github.com/ChidiRnweke/FollowThrough.ai/pull/112) | `2c125bb0698da8c6e757de5a43bc1e2fb08098db` | refactor(agent): run tool discovery and vector seeding from handlers                        |
| [#113](https://github.com/ChidiRnweke/FollowThrough.ai/pull/113) | `70dbff9f38df448fa33058ac7a68498d21c99d14` | refactor(diagrams): coordinate diagram generation from the request handler                  |
| [#114](https://github.com/ChidiRnweke/FollowThrough.ai/pull/114) | `b1c32fcd8f6c1665017ef76e2c7541138971614a` | test(workbench): avoid navigation races when switching accounts                             |
| [#115](https://github.com/ChidiRnweke/FollowThrough.ai/pull/115) | `0595dc906d1e5434c49a7837b69493659f9efbd7` | refactor(agent): load notes, skills and memory from run handlers                            |
| [#116](https://github.com/ChidiRnweke/FollowThrough.ai/pull/116) | `68374c6c137def7fbaa032f332323a0dacbbd364` | refactor(skills): provision built-in skills explicitly at request time                      |
| [#117](https://github.com/ChidiRnweke/FollowThrough.ai/pull/117) | `53994ed45716c5082b5fb31e89f45e5851eccba1` | refactor(skills): parse imported skill documents at the boundary                            |
| [#118](https://github.com/ChidiRnweke/FollowThrough.ai/pull/118) | `adf352cc49e9b81b1db1790cb5cb28ded135a4b2` | refactor(workspace): coordinate synchronized edits from request handlers                    |
| [#119](https://github.com/ChidiRnweke/FollowThrough.ai/pull/119) | `05c1df769e7c28a7c148278d29b2cc69ca75d2d3` | fix(diagrams): enforce project ownership and trash before deletion                          |
| [#120](https://github.com/ChidiRnweke/FollowThrough.ai/pull/120) | `33fd7232623cc93e1feb139ae5ff6adf95739254` | refactor(agent): settle run completion from the request handler                             |
| [#121](https://github.com/ChidiRnweke/FollowThrough.ai/pull/121) | `30f0b7ac06ec8418371fbda417a00e2cf90b8e09` | fix(skills): apply the exact instruction changes reviewed for approval                      |
| [#122](https://github.com/ChidiRnweke/FollowThrough.ai/pull/122) | `843a4e4d052ed7e513e0e6b1f4b10ae2a2c0ae25` | fix(skills): use the note title as the skill display name                                   |
| [#123](https://github.com/ChidiRnweke/FollowThrough.ai/pull/123) | `8ff157df50f16f38f4cca22f3c7936200991b85f` | refactor(workspace): coordinate offline edits from request handlers                         |
| [#124](https://github.com/ChidiRnweke/FollowThrough.ai/pull/124) | `9f282dca695dabd6e88a58008637c2f65e51dddb` | refactor(agent): own chat execution and recovery in the agent handler                       |
| [#125](https://github.com/ChidiRnweke/FollowThrough.ai/pull/125) | `040424acd408d77488e7df99124adfe5625b3f2c` | refactor(todos): extract task promises durably from the todo handler                        |
| [#126](https://github.com/ChidiRnweke/FollowThrough.ai/pull/126) | `4a651f4dece22d5422586a4f55466962556bfc20` | fix(agent): resume queued chat requests after restart                                       |
| [#127](https://github.com/ChidiRnweke/FollowThrough.ai/pull/127) | `ca17656d14b905958e7669435e1f249ccf548477` | refactor(agent): decide tool journal entries in a service, not values                       |
| [#128](https://github.com/ChidiRnweke/FollowThrough.ai/pull/128) | `eb646fd68e8c5fbb18f34d63df640234cea3b067` | fix(notes): keep pending note actions with their account                                    |
| [#129](https://github.com/ChidiRnweke/FollowThrough.ai/pull/129) | `fa064e80dd7b357f8e9f94915bdfb1efc7fb80f3` | refactor(references): run durable web reference searches from the handler                   |
| [#130](https://github.com/ChidiRnweke/FollowThrough.ai/pull/130) | `6fd53761c4e97406e3f91b552b5233726e1778a8` | refactor(relationships): run durable related-note searches from the handler                 |
| [#131](https://github.com/ChidiRnweke/FollowThrough.ai/pull/131) | `c5b728360577edcb4f741ab36a5676388cf66259` | fix(diagrams): complete generation only with saved output                                   |
| [#132](https://github.com/ChidiRnweke/FollowThrough.ai/pull/132) | `fe725dc2545702d17d74e9c4da579a02aa537318` | refactor(diagrams): run diagram generation and conversion as one durable action             |
| [#133](https://github.com/ChidiRnweke/FollowThrough.ai/pull/133) | `291148e2a9059f4f84cab0c53d56876db0ad070c` | refactor(provenance): build typed records in services, not values                           |
| [#134](https://github.com/ChidiRnweke/FollowThrough.ai/pull/134) | `969af06a9cb03d4f1f5e5232ab7095d471c9ff28` | refactor(suggestions): assemble review views from request handlers                          |
| [#135](https://github.com/ChidiRnweke/FollowThrough.ai/pull/135) | `72f1589993f9f7cf8385007ae373dde62f33b1bc` | refactor(suggestions): create proposals in the inbox service, not values                    |
| [#136](https://github.com/ChidiRnweke/FollowThrough.ai/pull/136) | `7f60e48607590d93ee6361a80b6419bb87ff6b1e` | refactor(notes): assemble backlink and reference views from handlers                        |
| [#137](https://github.com/ChidiRnweke/FollowThrough.ai/pull/137) | `df08b6dac7032440f8f8a2cc47c584beb075baba` | fix(skills): keep truncated portable names valid                                            |
| [#138](https://github.com/ChidiRnweke/FollowThrough.ai/pull/138) | `32301cd0bd8494451de6e14284d14b2e211c1cc9` | refactor(notes): share note view and revision rules in services                             |
| [#139](https://github.com/ChidiRnweke/FollowThrough.ai/pull/139) | `6d19b069d03b4a3de1eae202f41d14783189eaa6` | fix(notes): keep folder moves and note restores at the project root                         |
| [#140](https://github.com/ChidiRnweke/FollowThrough.ai/pull/140) | `b0f53dd4a8f0c8c270e83edf4d573a4b9bc7076c` | refactor(projects): coordinate shared project rules from request handlers                   |
| [#141](https://github.com/ChidiRnweke/FollowThrough.ai/pull/141) | `0669d247ac87a3aba6e384d380a2c7f92f7adfe4` | refactor(todos): share task-board export rendering in services                              |
| [#142](https://github.com/ChidiRnweke/FollowThrough.ai/pull/142) | `15ef2823ebe6b53bf72df13580dc77470d1be222` | refactor(memory): apply shared memory-edit rules from request handlers                      |
| [#143](https://github.com/ChidiRnweke/FollowThrough.ai/pull/143) | `2abbee435d7e2b4368670f01e0fb18240e20773d` | refactor(suggestions): record accepted agent proposals in the suggestions service           |
| [#144](https://github.com/ChidiRnweke/FollowThrough.ai/pull/144) | `197dc5692daa55a4797eab84e1bf4d7adb608049` | refactor(diagrams): resolve selected-text anchors through selection origins                 |
| [#145](https://github.com/ChidiRnweke/FollowThrough.ai/pull/145) | `2a8f8a754b4749b2e9ac6019f1953532a2b3fd81` | test(workbench): finish storage reads before deleting test databases                        |
| [#146](https://github.com/ChidiRnweke/FollowThrough.ai/pull/146) | `23e9f6e6d44001d8edb1b41912061ea3fb8bcb73` | refactor(notes): create note folders and skills from request handlers                       |
| [#147](https://github.com/ChidiRnweke/FollowThrough.ai/pull/147) | `a8761180798207f0186ec8d583384a3ff7be0643` | refactor(todos): build task source views from request handlers                              |
| [#148](https://github.com/ChidiRnweke/FollowThrough.ai/pull/148) | `f5b95e75d34ec8569b9ff771c8d48e31c9637efb` | fix(todos): keep deleted tasks hidden and reject stale edits                                |
| [#157](https://github.com/ChidiRnweke/FollowThrough.ai/pull/157) | `49eab463d4b313ab0609e19e03681c5366218e10` | docs(architecture): keep business rules out of models                                       |
| [#158](https://github.com/ChidiRnweke/FollowThrough.ai/pull/158) | `6cbf9d53b6df70dc7058dd723d6d99074761fdc4` | refactor(todos): preserve concurrent task edits in controller transactions                  |
| [#159](https://github.com/ChidiRnweke/FollowThrough.ai/pull/159) | `6fac0f20258e2db281a316fc237b70047b8eb403` | refactor(todos): share task creation rules across controller workflows                      |
| [#160](https://github.com/ChidiRnweke/FollowThrough.ai/pull/160) | `6b9b63a443f47d5a43bcef53be24861d0e71ee2b` | refactor(relationships): preserve edge identity through service-owned writes                |
| [#161](https://github.com/ChidiRnweke/FollowThrough.ai/pull/161) | `c9c1e278aba83dce6801f1bd711474c3b152242b` | refactor(notes): keep reviewed change rules in focused services                             |
| [#162](https://github.com/ChidiRnweke/FollowThrough.ai/pull/162) | `1884b8a6c2d5820138dd547df22bac88414e1f46` | refactor(notes): move shared reading rules into services                                    |
| [#163](https://github.com/ChidiRnweke/FollowThrough.ai/pull/163) | `2b631a00b46f8a8a2f1b683600063eb6adcd4c6d` | refactor(agent): own tool name ranking in recovery                                          |
| [#164](https://github.com/ChidiRnweke/FollowThrough.ai/pull/164) | `7a736bdbb434fd1ec6895281a2379c3ee6fdcf34` | refactor(notes): own trash transitions in controllers                                       |
| [#165](https://github.com/ChidiRnweke/FollowThrough.ai/pull/165) | `c89d1d38bc7901d549a6d92686b83b53de1f51dc` | refactor(notes): own authored resource reference rules                                      |
| [#166](https://github.com/ChidiRnweke/FollowThrough.ai/pull/166) | `ba88fcb5eb854aec68651be115cba5d6fc147979` | refactor(notes): own comparison and revision highlight rules                                |
| [#167](https://github.com/ChidiRnweke/FollowThrough.ai/pull/167) | `f376821e7f8157fdcb191c1e893552c51958cfc2` | refactor(sync): own queue and cache state rules in services                                 |
| [#168](https://github.com/ChidiRnweke/FollowThrough.ai/pull/168) | `7678f07edff9c00caa94775e9a41c5ab1ffbd9ea` | fix(diagrams): serialize trash transitions against current state                            |
| [#169](https://github.com/ChidiRnweke/FollowThrough.ai/pull/169) | `37020c667ce431fc6fc087109ddc4270affffb7f` | fix(agent): preserve concurrent preference edits                                            |
| [#170](https://github.com/ChidiRnweke/FollowThrough.ai/pull/170) | `0851c399ab3e5a2d5dbef0fa5958ae10fa2f799a` | fix(agent): validate configured model choices consistently                                  |
| [#171](https://github.com/ChidiRnweke/FollowThrough.ai/pull/171) | `45ef54246de46ef04c0fb94cd05f7e837294b2c3` | fix(agent): lock cancellation and record its terminal event once                            |
| [#172](https://github.com/ChidiRnweke/FollowThrough.ai/pull/172) | `bdfbc7810aa0a43ef43523c4a11a1ba18483d7dd` | fix(agent): lock approval batches before resolving requeue                                  |
| [#173](https://github.com/ChidiRnweke/FollowThrough.ai/pull/173) | `9b01d8cd6b5641d8a1d0735750a719e417c5c22f` | fix(diagrams): persist run context under the authoritative lock                             |
| [#174](https://github.com/ChidiRnweke/FollowThrough.ai/pull/174) | `81f72cc4944688325e721142b1f7fde5c7334b90` | fix(diagrams): own direct run creation and settlement transactions                          |
| [#175](https://github.com/ChidiRnweke/FollowThrough.ai/pull/175) | `08bd498a0b657a57eefd14cbfd817a2b48fd5e83` | fix(agent): commit prepared context with its start event                                    |
| [#176](https://github.com/ChidiRnweke/FollowThrough.ai/pull/176) | `c16a8e791f4b1d568808cb3c4c243934a1671c72` | fix(agent): return cleared pending calls after settlement                                   |
| [#177](https://github.com/ChidiRnweke/FollowThrough.ai/pull/177) | `c3fe35ae91994333a23cc26327a4e1f91878de92` | refactor(agent): give claims and checkpoints explicit write owners                          |
| [#178](https://github.com/ChidiRnweke/FollowThrough.ai/pull/178) | `eb65fed0ebe7ec42dc0d92527b79196f9619d927` | fix(agent): clear checkpoints with owned terminal writes                                    |
| [#179](https://github.com/ChidiRnweke/FollowThrough.ai/pull/179) | `25e08ad8e42220ef769682f62d9020cab460360e` | refactor(agent): reconstruct run output outside event persistence                           |
| [#180](https://github.com/ChidiRnweke/FollowThrough.ai/pull/180) | `6be1c2386dc7cea8b98db5ff761e7384ff968bd6` | fix(agent): resolve image readers before provider execution                                 |
| [#181](https://github.com/ChidiRnweke/FollowThrough.ai/pull/181) | `cb2a40a1304cf40e1e48a25339b33b1eff43e4c5` | fix(agent): freeze resolved web research settings                                           |
| [#182](https://github.com/ChidiRnweke/FollowThrough.ai/pull/182) | `3e2f650215c747fe118309c6c6970aa93fe5b9fb` | refactor(diagrams): decode canvas results at the storage boundary                           |
| [#183](https://github.com/ChidiRnweke/FollowThrough.ai/pull/183) | `eb2e505a5b8349f12bd735fb50480360647e064b` | refactor(notes): resolve draft saves in controller transactions                             |
| [#184](https://github.com/ChidiRnweke/FollowThrough.ai/pull/184) | `99b8574886b8cab992a5a08ed56fa050c16c0b38` | fix(diagrams): commit revision writes and indexing together                                 |
| [#185](https://github.com/ChidiRnweke/FollowThrough.ai/pull/185) | `3d4f270938472d619cd986fada9d13a788350a7d` | fix(notes): publish the locked revision with targeted writes                                |
| [#186](https://github.com/ChidiRnweke/FollowThrough.ai/pull/186) | `fce906d2c0dfcbeb40e9d33086953d4321562660` | fix(diagrams): preserve peer changes during mermaid generation                              |
| [#187](https://github.com/ChidiRnweke/FollowThrough.ai/pull/187) | `3d62de8481358b9e02d1899eb7ed020aef611aaa` | refactor(diagrams): retire unused drawio save surfaces                                      |
| [#188](https://github.com/ChidiRnweke/FollowThrough.ai/pull/188) | `37f24b7a9400f43a510bc1c822621a8a8d2aef0e` | fix(diagrams): persist resolved content and generation provenance                           |
| [#189](https://github.com/ChidiRnweke/FollowThrough.ai/pull/189) | `0c6011787bad068a3d4c4a87c975708722887b1e` | refactor(diagrams): share visible label rules across readers                                |
| [#190](https://github.com/ChidiRnweke/FollowThrough.ai/pull/190) | `2d63d69eb5d0b52a015fed93b3270122e46f6bcd` | fix(exports): preserve valid diagram sizes and column proportions                           |
| [#191](https://github.com/ChidiRnweke/FollowThrough.ai/pull/191) | `1a8b4f53f781747ac79c00ca2a1c60060606abe4` | refactor(exports): resolve heading spacing before rendering                                 |
| [#192](https://github.com/ChidiRnweke/FollowThrough.ai/pull/192) | `ff2b5734e450671b8c35fc294133accf3287eeb2` | refactor(notes): own editor recovery in the shared service                                  |
| [#193](https://github.com/ChidiRnweke/FollowThrough.ai/pull/193) | `75014c3dc6869c4ade69b0bf8a2b9eb9a6cf1d6b` | fix(projects): serialize tree changes under the project lock                                |
| [#194](https://github.com/ChidiRnweke/FollowThrough.ai/pull/194) | `98da1a03cc28129a6553d3baeb24dad88bec360e` | fix(notes): preserve restored notes during permanent deletion                               |
| [#195](https://github.com/ChidiRnweke/FollowThrough.ai/pull/195) | `ac384a28d09e79667aa64d75635de906073e4282` | fix(skills): preserve authored notes during built-in repair                                 |
| [#196](https://github.com/ChidiRnweke/FollowThrough.ai/pull/196) | `ce18319ed334beead93225be1e784e5c8b506f8b` | refactor(notes): retire whole-note persistence                                              |
| [#197](https://github.com/ChidiRnweke/FollowThrough.ai/pull/197) | `8f174b51ddcddf5027a2ca3a20dcc63bfa6f70bb` | fix(skills): preserve concurrent edits and restoration metadata                             |
| [#198](https://github.com/ChidiRnweke/FollowThrough.ai/pull/198) | `04f7311ccec5408a0f8fe59f568d690121ab8832` | fix(projects): allow provisioning after inbox archive                                       |
| [#199](https://github.com/ChidiRnweke/FollowThrough.ai/pull/199) | `27e031186f4b07b119fbb866bff2d406b7f02891` | fix(skills): persist resolved metadata without upserts                                      |
| [#200](https://github.com/ChidiRnweke/FollowThrough.ai/pull/200) | `7bc472803019fabc58ab7f3403c9b33da1f3d18f` | fix(skills): preserve project pin scope under concurrent writes                             |
| [#201](https://github.com/ChidiRnweke/FollowThrough.ai/pull/201) | `4bf5ac3aac239a8bcef6760580fc3f7539565677` | refactor(skills): keep one prepared note per edit                                           |
| [#202](https://github.com/ChidiRnweke/FollowThrough.ai/pull/202) | `274f18ed82f3a44ecb012df0d37a5b2bcbb48547` | fix(skills): serialize portable name decisions                                              |
| [#203](https://github.com/ChidiRnweke/FollowThrough.ai/pull/203) | `56cd32dc1a526c5bf43d62a654db172a06e38e30` | fix(skills): record usage with successful active loads                                      |
| [#204](https://github.com/ChidiRnweke/FollowThrough.ai/pull/204) | `692de9a08f074bb3f086244a438cb559f22db580` | fix(todos): preserve extracted waiting-on owners                                            |
| [#205](https://github.com/ChidiRnweke/FollowThrough.ai/pull/205) | `6919ed5303d9cdeaaae76557aea8c22a0d44872f` | fix(todos): validate resolved dates at the provider boundary                                |
| [#206](https://github.com/ChidiRnweke/FollowThrough.ai/pull/206) | `afa3bf78a7920e628ec957726d3d1427564118f6` | refactor(todos): enforce resolved completion states                                         |
| [#207](https://github.com/ChidiRnweke/FollowThrough.ai/pull/207) | `011fb2ad1926b9b43b0f20f7b4da4501d3e81abf` | refactor(provenance): validate complete anchor ranges                                       |
| [#208](https://github.com/ChidiRnweke/FollowThrough.ai/pull/208) | `2d66ba0071da83d50479027759374274d01d658e` | fix(todos): preserve local calendar dates                                                   |
| [#209](https://github.com/ChidiRnweke/FollowThrough.ai/pull/209) | `144a1e484143dc5540d035571645b5bb1a018da9` | fix(todos): allow edits after linked notes are archived                                     |
| [#210](https://github.com/ChidiRnweke/FollowThrough.ai/pull/210) | `bdbe405f90c27ca9c872a5576d8322773ad65873` | refactor(todos): retire unused read contracts                                               |
| [#211](https://github.com/ChidiRnweke/FollowThrough.ai/pull/211) | `1c47310b7f085824bd10011a1b3bb6320fccbfd5` | fix(todos): hide details for archived projects                                              |
| [#212](https://github.com/ChidiRnweke/FollowThrough.ai/pull/212) | `166afaaf943a3c14a4bbe935f9c1e5ce6342449d` | refactor(todos): require a resolved deletion time                                           |
| [#213](https://github.com/ChidiRnweke/FollowThrough.ai/pull/213) | `7a0f877f5c10057af763402f187418337f762224` | refactor(todos): retire unused embedded insertion command                                   |
| [#214](https://github.com/ChidiRnweke/FollowThrough.ai/pull/214) | `99a8cbefb79040d8ec5f2cda5e713575685b76ff` | fix(todos): reject unavailable project exports                                              |
| [#215](https://github.com/ChidiRnweke/FollowThrough.ai/pull/215) | `bda5bdcb925b6967eb863c04f43a516b27659952` | refactor(todos): remove unused source selector value                                        |
| [#216](https://github.com/ChidiRnweke/FollowThrough.ai/pull/216) | `8c4daae048e6eacfb83b7f047fbaf2714f4649f8` | fix(attachments): reject unavailable screenshot tasks                                       |
| [#217](https://github.com/ChidiRnweke/FollowThrough.ai/pull/217) | `2052f48af20d2c179d5ce21b98b1951e69d7a4ab` | fix(attachments): preserve empty extracted content                                          |
| [#218](https://github.com/ChidiRnweke/FollowThrough.ai/pull/218) | `78bed6e627a6e0af9ead54c98798dd4a2e0e9f0a` | fix(suggestions): validate stored task dates                                                |
