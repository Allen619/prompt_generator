import ky from "ky";
import copy from "copy-to-clipboard";
import { Textarea } from "./components";
import handlePrompt from "./lib/prompt";
import Header from "./components/Header";
import { Input } from "./components/ui/input";
import CodeMirror from "@uiw/react-codemirror";
import PoweredBy from "./components/PoweredBy";
import { Button } from "./components/ui/button";
import { Select, Spinner } from "@radix-ui/themes";
import { languages } from "@codemirror/language-data";
import { toast, ToastContainer } from "react-toastify";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { useAppDispatch, useAppSelector } from "./store/hooks";
import { LanguagePopover } from "./components/LanguagePopover";
import { AnalyzeImagesPrompt } from "./lib/AnalyzeImagesPrompt";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { selectGlobal, setGlobalState } from "./store/globalSlice";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { fetchApi, errMessage, extractCodeBlocksContent } from "./utils";
import { HEADER_TITLE, LANG, LANG_SHORT, LANGUAGE_LIBRARY, modelList } from "./lib/Language";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./components/ui/dialog";
import PasswordVerification from './components/PasswordVerification';

import "react-toastify/dist/ReactToastify.css";

const tipsContentDefault = "新加坡Prompt大赛冠军框架,一键将简单任务拆解,分析,并生成结构化提示词。";

function App() {
  const dispatch = useAppDispatch();
  const global = useAppSelector(selectGlobal);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isUpd, setIsUpd] = useState(false);
  const [content, setContent] = useState("");
  const [errComp, setErrComp] = useState("");
  const [oldContent, setOldContent] = useState("");
  const [inpContent, setInpContent] = useState("");
  const [pictureUrl, setPictureUrl] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testContent, setTestContent] = useState("");
  const [isDisabled, setIsDisabled] = useState(false);
  const [updInpContent, setUpdInpContent] = useState("");
  const [customContent, setCustomContent] = useState('');
  const [structureType, setStructureType] = useState("CO-STAR");
  const [tipsContent, setTipsContent] = useState(tipsContentDefault);
  const [isVerified, setIsVerified] = useState(false);

  const showBrand = import.meta.env.VITE_APP_SHOW_BRAND === "true";

  useEffect(() => {
    const type = window.localStorage.getItem('structureType');
    const tips = window.localStorage.getItem('structureTips');
    if (type) { setStructureType(type || 'CO-STAR') }
    if (tips) { setTipsContent(tips || tipsContentDefault) }
  }, [])

  // Read the current user's language
  useEffect(() => {
    const windowLanguage = window.navigator.language;
    let lang: 'chinese' | 'english' | 'japanese' = 'english';
    if (["en-US", "zh-CN", "ja-JP"].includes(windowLanguage)) {
      // @ts-ignore
      lang = LANG[windowLanguage]
    }
    const localStorageLanguage = localStorage.getItem('lang')
    if (localStorageLanguage) lang = localStorageLanguage as 'chinese' | 'english' | 'japanese';
    const searchLang = new URLSearchParams(window.location.search).get('lang')
    if (searchLang) {
      // @ts-ignore
      if (["en-US", "zh-CN", "ja-JP"].includes(searchLang)) lang = LANG[searchLang];
      // @ts-ignore
      else if (["en", "zh", "ja"].includes(searchLang)) lang = LANG_SHORT[searchLang]
      else lang = 'english'
    }
    document.title = HEADER_TITLE[lang]
    localStorage.setItem('lang', lang)
    dispatch(setGlobalState({ language: lang }))
  }, [])

  const onGeneratePromptFunc = async () => {
    if (inpContent.trim() === "") {
      setErrComp(LANGUAGE_LIBRARY[global.language]["请输入内容！"]);
      return;
    }

    if (customContent.trim() === "" && structureType === 'Custom') {
      setErrComp(LANGUAGE_LIBRARY[global.language]["提示词优化指令为空，请先编辑优化指令！"]);
      return;
    }

    setErrComp("");
    setIsDisabled(true);

    const promptTips = handlePrompt(structureType, inpContent, customContent);
    let messages;

    if (['RISE', 'O1-STYLE'].includes(structureType)) {
      setContent(promptTips);
      setIsDisabled(false);
      return;
    }

    if (['CO-STAR', 'CRISPE', 'DRAW'].includes(structureType)) {
      messages = [
        {
          role: "system",
          content: promptTips,
        },
        { role: "user", content: inpContent },
      ];
    } else {
      messages = [
        { role: "user", content: promptTips },
      ];
    }

    const body = {
      model: import.meta.env.VITE_APP_MODEL_NAME,
      messages,
      stream: true,
      max_tokens: 4096,
    };

    return fetchApi(
      `${import.meta.env.VITE_APP_API_URL}/v1/chat/completions`,
      "post",
      body,
      { Authorization: `Bearer ${import.meta.env.VITE_APP_API_KEY}`, }
    ).then(async (response) => {
      // 流式处理
      if (response.ok && response.body) {
        const reader = response.body.getReader();
        readStream(reader, "");
      } else if (!response.ok && response.body) {
        const reader = response.body.getReader();
        readStream(reader, "");
      }

      function readStream(
        reader: ReadableStreamDefaultReader<Uint8Array>,
        answer: string
      ): Promise<ReadableStreamDefaultReader<Uint8Array> | undefined> {
        return reader.read().then(({ value }) => {
          const chunk = new TextDecoder("utf-8").decode(value);

          if (chunk.indexOf("error") > -1) {
            const chunkArr = chunk
              .replace("error:", "")
              .replace("{", "")
              .replace("}", "")
              .trimStart()
              .trimEnd()
              .split(",");

            chunkArr.forEach((chunk) => {
              if (chunk.indexOf("err_code") > -1) {
                setErrComp(
                  errMessage(+chunk.split(":")[2], global.language)
                );
              }
            });
            setIsDisabled(false);
            setIsUpd(false);
            return;
          }
          if (chunk.indexOf("[DONE]") > -1) {
            console.log(answer);
            let translateContent = extractCodeBlocksContent(answer)[0];
            translateContent = translateContent ? translateContent : answer;
            setContent(translateContent);
            setIsDisabled(false);
            return;
          }

          const chunkList = chunk
            .split("\n")
            .filter((chunk) => chunk)
            .map((chunk) =>
              chunk
                .replace("data:", "")
                .trimStart()
                .trimEnd()
                .replace(/'/g, '"')
            );
          chunkList.forEach((chunk) => {
            if (!chunk) return;
            try {
              const chunkJSON = JSON.parse(chunk);
              chunkJSON?.choices.forEach(
                (choice: {
                  delta: {
                    content: string;
                  };
                }) => {
                  const content = choice?.delta?.content;
                  if (content) {
                    answer += content;
                    setContent(answer);
                  }
                }
              );
            } catch (error) { }
          });
          return readStream(reader, answer);
        });
      }
    }).catch(async (error) => {
      const result = await error.response.json();
      if (result?.error?.err_code) {
        setErrComp(errMessage(result.error.err_code, global.language));
      } else {
        setErrComp(LANGUAGE_LIBRARY[global.language]['未知错误']);
      }
      setIsDisabled(false);
      setIsUpd(false);
      console.log(error);
    })
  };

  const onUpdPromptFunc = async () => {
    if (updInpContent.trim() === "") {
      setErrComp(LANGUAGE_LIBRARY[global.language]["请输入需要修改的点！"]);
      return;
    }

    if (customContent.trim() === "" && structureType === 'Custom') {
      setErrComp(LANGUAGE_LIBRARY[global.language]["提示词优化指令为空，请先编辑优化指令！"]);
      return;
    }

    setUpdInpContent("");
    setErrComp("");
    setIsUpd(true);
    setOldContent(content)

    const promptTips = handlePrompt(structureType, '', customContent);
    let messages;
    if (['CO-STAR', 'CRISPE', 'DRAW'].includes(structureType)) {
      messages = [
        { role: "system", content: promptTips, },
        { role: "user", content: inpContent },
        { role: "assistant", content: content },
        { role: "user", content: updInpContent },
      ];
    } else {
      messages = [
        { role: "user", content: promptTips },
        { role: "assistant", content },
        { role: "user", content: updInpContent },
      ];
    }
    const body = {
      model: import.meta.env.VITE_APP_MODEL_NAME,
      messages,
      stream: true,
      max_tokens: 4096,
    };

    return fetchApi(
      `${import.meta.env.VITE_APP_API_URL}/v1/chat/completions`,
      "post",
      body,
      {
        Authorization: `Bearer ${import.meta.env.VITE_APP_API_KEY}`,
      }
    ).then((response) => {
      // 流式处理
      if (response.ok && response.body) {
        const reader = response.body.getReader();
        readStream(reader, "");
      } else if (!response.ok && response.body) {
        const reader = response.body.getReader();
        readStream(reader, "");
      }

      function readStream(
        reader: ReadableStreamDefaultReader<Uint8Array>,
        answer: string
      ): Promise<ReadableStreamDefaultReader<Uint8Array> | undefined> {
        return reader.read().then(({ value }) => {
          const chunk = new TextDecoder("utf-8").decode(value);
          if (chunk.indexOf("error") > -1) {
            const chunkArr = chunk
              .replace("error:", "")
              .replace("{", "")
              .replace("}", "")
              .trimStart()
              .trimEnd()
              .split(",");
            chunkArr.forEach((chunk) => {
              if (chunk.indexOf("err_code") > -1) {
                setErrComp(
                  errMessage(+chunk.split(":")[2], global.language)
                );
              }
            });
            setIsDisabled(false);
            setIsUpd(false);
            return;
          }

          if (chunk.indexOf("[DONE]") > -1) {
            let translateContent = extractCodeBlocksContent(answer)[0];
            translateContent = translateContent ? translateContent : answer;
            setContent(translateContent);
            setIsDisabled(false);
            setIsUpd(false);
            return;
          }

          const chunkList = chunk
            .split("\n")
            .filter((chunk) => chunk)
            .map((chunk) =>
              chunk
                .replace("data:", "")
                .trimStart()
                .trimEnd()
                .replace(/'/g, '"')
            );
          chunkList.forEach((chunk) => {
            if (!chunk) return;
            try {
              const chunkJSON = JSON.parse(chunk);
              chunkJSON?.choices.forEach(
                (choice: {
                  delta: {
                    content: string;
                  };
                }) => {
                  const content = choice?.delta?.content;
                  if (content) {
                    answer += content;
                    setContent(answer);
                  }
                }
              );
            } catch (error) { }
          });
          return readStream(reader, answer);
        });
      }
    }).catch(async (error) => {
      const result = await error.response.json();
      if (result?.error?.err_code) {
        setErrComp(errMessage(result.error.err_code, global.language));
      } else {
        setErrComp(LANGUAGE_LIBRARY[global.language]['未知错误']);
      }
      setIsDisabled(false);
      setIsUpd(false);
    })
  };

  const onCopyFunc = () => {
    copy(content);
    toast.success(LANGUAGE_LIBRARY[global.language][`复制成功 !`], {
      position: "top-right",
      autoClose: 2000,
      hideProgressBar: true,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      theme: "light",
    });
  };

  const onBack = () => {
    if (oldContent) {
      setContent(oldContent)
      setOldContent('');
    }
  }

  const scrollBottom = ViewPlugin.fromClass(
    class {
      update(update: any) {
        if (update.docChanged) {
          update.view.scrollDOM.scrollTop = update.view.scrollDOM.scrollHeight;
        }
      }
    }
  );

  const onTestGeneratePromptFunc = async () => {
    setErrComp("");
    if (structureType !== "DRAW") {
      setIsTesting(true);
      const url = `${import.meta.env.VITE_APP_API_URL}/v1/chat/completions`;
      const body = {
        model: import.meta.env.VITE_APP_MODEL_NAME,
        messages: [{ role: "user", content }],
        stream: true,
        max_tokens: 4096,
      };

      const header = { Authorization: `Bearer ${import.meta.env.VITE_APP_API_KEY}`, };
      return fetchApi(url, "post", body, header).then((response) => {
        if (response.ok && response.body) {
          const reader = response.body.getReader();
          readStream(reader, "");
        } else if (!response.ok && response.body) {
          const reader = response.body.getReader();
          readStream(reader, "");
        }

        function readStream(
          reader: ReadableStreamDefaultReader<Uint8Array>,
          answer: string
        ): Promise<ReadableStreamDefaultReader<Uint8Array> | undefined> {
          return reader.read().then(({ value }) => {
            const chunk = new TextDecoder("utf-8").decode(value);
            if (chunk.indexOf("error") > -1) {
              const chunkArr = chunk
                .replace("error:", "")
                .replace("{", "")
                .replace("}", "")
                .trimStart()
                .trimEnd()
                .split(",");

              chunkArr.forEach((chunk) => {
                if (chunk.indexOf("err_code") > -1) {
                  setErrComp(
                    errMessage(+chunk.split(":")[2], global.language)
                  );
                }
              });
              setIsTesting(false);
              return;
            }
            if (chunk.indexOf("[DONE]") > -1) {
              console.log(answer);
              let translateContent = extractCodeBlocksContent(answer)[0];
              translateContent = translateContent ? translateContent : answer;
              setTestContent(translateContent);
              setIsTesting(false);
              return;
            }

            const chunkList = chunk
              .split("\n")
              .filter((chunk) => chunk)
              .map((chunk) =>
                chunk
                  .replace("data:", "")
                  .trimStart()
                  .trimEnd()
                  .replace(/'/g, '"')
              );
            chunkList.forEach((chunk) => {
              if (!chunk) return;
              try {
                const chunkJSON = JSON.parse(chunk);
                chunkJSON?.choices.forEach(
                  (choice: {
                    delta: {
                      content: string;
                    };
                  }) => {
                    const content = choice?.delta?.content;
                    if (content) {
                      answer += content;
                      setTestContent(answer);
                    }
                  }
                );
              } catch (error) { }
            });
            return readStream(reader, answer);
          })
        }
      }).catch(async (error) => {
        const result = await error.response.json();
        if (result?.error?.err_code) {
          setErrComp(errMessage(result.error.err_code, global.language));
        } else {
          setErrComp(LANGUAGE_LIBRARY[global.language]['未知错误']);
        }
        setIsDisabled(false);
        setIsUpd(false);
      })
    } else {
      setIsTesting(true);
      const url = `${import.meta.env.VITE_APP_API_URL}/302/submit/flux-dev`;
      const myHeaders = new Headers();
      myHeaders.append("Authorization", `Bearer ${import.meta.env.VITE_APP_API_KEY}`);
      myHeaders.append("User-Agent", "Apifox/1.0.0 (https://apifox.com)");
      myHeaders.append("Content-Type", "application/json");
      const raw = JSON.stringify({
        "prompt": content,
        "image_size": {
          "width": 1024,
          "height": 1024
        },
        "num_inference_steps": 28,
        "guidance_scale": 3.5
      });
      const resp = await ky(url, {
        method: "POST",
        body: raw,
        headers: myHeaders,
        timeout: 90000,
      });
      const respTxt = await resp.text();
      const result = JSON.parse(respTxt);
      setIsTesting(false);
      if (result.error) {
        setErrComp(
          errMessage(result.error.err_code, global.language)
        );
        return;
      }
      setPictureUrl(result.images[0].url);
    }
  };

  const onGeneratePromptImageFunc = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    const noNotSupportedType = ['svg', 'ico', 'x-icon', 'icon'];
    setErrComp('')
    if (file) {
      if (noNotSupportedType.some(s => file.type.indexOf(s) > -1)) {
        setErrComp(LANGUAGE_LIBRARY[global.language]['暂不支持当前图片格式']);
        return;
      }
      setIsDisabled(true);
      const fontData = new FormData();
      fontData.append('file', file)
      fontData.append('need_compress', 'true')
      const imageResult: any = await ky(import.meta.env.VITE_APP_IMAGE_FETCH_URL, {
        method: 'POST',
        body: fontData,
        timeout: false,
      }).then(res => res.json())
      const imgUrl = imageResult.data.url;
      if (imgUrl) {
        const model = import.meta.env.VITE_APP_MODEL_NAME;
        ky(`${import.meta.env.VITE_APP_API_URL}/v1/chat/completions`,
          {
            method: 'post',
            body: JSON.stringify(AnalyzeImagesPrompt({ model, url: imgUrl })),
            timeout: false,
            headers: {
              "Authorization": `Bearer ${import.meta.env.VITE_APP_API_KEY}`,
              "accept": "application/json",
              "Content-Type": "application/json",
            }
          }
        )
          .then((response) => response)
          .then((response) => {
            // 流式处理
            if (response.ok && response.body) {
              const reader = response.body.getReader();
              readStream(reader, "");
            } else if (!response.ok && response.body) {
              const reader = response.body.getReader();
              readStream(reader, "");
            }

            function readStream(
              reader: ReadableStreamDefaultReader<Uint8Array>,
              answer: string
            ): Promise<ReadableStreamDefaultReader<Uint8Array> | undefined> {
              return reader.read().then(({ value }) => {
                const chunk = new TextDecoder("utf-8").decode(value);

                if (chunk.indexOf("error") > -1) {
                  const chunkArr = chunk
                    .replace("error:", "")
                    .replace("{", "")
                    .replace("}", "")
                    .trimStart()
                    .trimEnd()
                    .split(",");

                  chunkArr.forEach((chunk) => {
                    if (chunk.indexOf("err_code") > -1) {
                      setErrComp(
                        errMessage(+chunk.split(":")[2], global.language)
                      );
                    }
                  });
                  setIsDisabled(false);
                  setIsUpd(false);
                  return;
                }
                if (chunk.indexOf("[DONE]") > -1) {
                  console.log(answer);
                  let translateContent = extractCodeBlocksContent(answer)[0];
                  translateContent = translateContent ? translateContent : answer;
                  setContent(translateContent);
                  setInpContent(translateContent);
                  setIsDisabled(false);
                  return;
                }

                const chunkList = chunk
                  .split("\n")
                  .filter((chunk) => chunk)
                  .map((chunk) =>
                    chunk
                      .replace("data:", "")
                      .trimStart()
                      .trimEnd()
                      .replace(/'/g, '"')
                  );
                chunkList.forEach((chunk) => {
                  if (!chunk) return;
                  try {
                    const chunkJSON = JSON.parse(chunk);
                    chunkJSON?.choices.forEach(
                      (choice: {
                        delta: {
                          content: string;
                        };
                      }) => {
                        const content = choice?.delta?.content;
                        if (content) {
                          answer += content;
                          setContent(answer);
                        }
                      }
                    );
                  } catch (error) { }
                });
                return readStream(reader, answer);
              });
            }
          }).catch(async (error) => {
            const result = await error.response.json();
            if (result?.error?.err_code) {
              setErrComp(errMessage(result.error.err_code, global.language));
            } else {
              setErrComp(LANGUAGE_LIBRARY[global.language]['未知错误']);
            }
            setIsDisabled(false);
            setIsUpd(false);
          })
      }
    }
  }

  const handleChooseImageClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const onDisplayUpload = () => {
    const model = import.meta.env.VITE_APP_MODEL_NAME;
    return modelList.includes(model)
  }

  useEffect(() => {
    const text = window.localStorage.getItem('customContent')
    if (text) { setCustomContent(text) }
  }, [])

  const onCustom = () => {
    let value = customContent;
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-fit text-[#fff] hover:text-[#fff] bg-violet-500 hover:bg-violet-600 active:bg-violet-700">
            {LANGUAGE_LIBRARY[global.language]["编辑提示词优化指令"]}
          </Button>
        </DialogTrigger>
        <DialogContent className="xl:max-w-[55vw] lg:max-w-[80vw] max-w-[100vw]">
          <DialogHeader>
            <DialogTitle>{LANGUAGE_LIBRARY[global.language]["提示词优化指令"]}</DialogTitle>
            <DialogDescription></DialogDescription>
          </DialogHeader>
          <div>
            <Textarea
              className="min-h-[300px]"
              defaultValue={value}
              placeholder={LANGUAGE_LIBRARY[global.language]["请输入提示词优化指令"]}
              onChange={(e) => { value = e.target.value }}
            />
          </div>
          <DialogFooter>
            <div className="flex justify-between w-full items-end">
              <p className="text-xs text-[#444444]">{LANGUAGE_LIBRARY[global.language][`你可以使用"{input}"作为占位符替换输入的任务，如果没有指定，则输入的任务会被追加到末尾。`]}</p>
              <DialogClose className="min-w-[100px] text-[#fff] py-1 border hover:text-[#fff] bg-violet-500 hover:bg-violet-600 active:bg-violet-700 rounded-sm" onClick={() => {
                window.localStorage.setItem('customContent', value)
                setCustomContent(value)
              }}>
                {LANGUAGE_LIBRARY[global.language]["保存"]}
              </DialogClose>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <>
      
      {isVerified ? (
        <div className="absolute top-0 left-0 right-0 flex flex-col min-h-full bg-[#f5f5f5]" >
          {
            Boolean(errComp) && (
              <div
                className="fixed top-3 py-2 px-3 flex justify-center items-center text-sm gap-2 error-message box-border"
                style={{
                  border: "0.8px solid #faad14",
                  borderRadius: "6px",
                  backgroundColor: "rgb(255, 251, 230)",
                }}
              >
                <svg
                  viewBox="64 64 896 896"
                  focusable="false"
                  data-icon="exclamation-circle"
                  width="1em"
                  height="1em"
                  fill="rgb(250, 173, 20)"
                  aria-hidden="true"
                >
                  <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm-32 232c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v272c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V296zm32 440a48.01 48.01 0 010-96 48.01 48.01 0 010 96z"></path>
                </svg>
                <div dangerouslySetInnerHTML={{ __html: errComp }}></div>
              </div>
            )
          }
          < div className="flex justify-end p-2 box-border" >
            <div className='flex absolute right-10 top-2'><LanguagePopover /></div>
          </div >
          <Header language={global.language} />
          <div className="relative">
            <div
              id="main-container"
              className="main-container relative lg:p-7 lg:py-4 p-4 py-2 mb-6 flex flex-col gap-3 overflow-y-auto box-border"
            >
              <div className="flex justify-center gap-2 items-center ">
                <Input
                  enterKeyHint="search"
                  placeholder={
                    structureType === "DRAW"
                      ? LANGUAGE_LIBRARY[global.language]["请输入您的想法，例如：太空人骑着彩虹独角兽"]
                      : LANGUAGE_LIBRARY[global.language]["请输入您的任务,例如:写一篇宣传AI的小红书"]
                  }
                  className="custom-input-style"
                  value={inpContent}
                  onChange={(e) => {
                    const val = e.target.value;
                    setInpContent(val);
                  }}
                  onKeyDown={(e) => {
                    if (e.keyCode !== 13) {
                      return;
                    }
                    onGeneratePromptFunc();
                  }}
                  disabled={isDisabled || isUpd || isTesting}
                  data-tag="generate"
                />
                <Button
                  className="bg-violet-500 hover:bg-violet-600 active:bg-violet-700 px-10 box-border"
                  onClick={onGeneratePromptFunc}
                  disabled={isDisabled || isUpd || isTesting}
                >
                  <Spinner className="mr-2" loading={isDisabled} />
                  {isDisabled ? LANGUAGE_LIBRARY[global.language]["正在生成，请耐心等待..."] : LANGUAGE_LIBRARY[global.language]["生成"]}
                </Button>
                <div className={
                  `flex items-center gap-2 
                  ${structureType === "DRAW" && onDisplayUpload() ? 'block' : 'hidden'}`
                }>
                  <div>{LANGUAGE_LIBRARY[global.language]["或"]}</div>
                  <Button
                    className="bg-violet-500 hover:bg-violet-600 active:bg-violet-700 px-10 box-border"
                    onClick={handleChooseImageClick}
                    disabled={isDisabled || isUpd || isTesting}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={onGeneratePromptImageFunc}
                      style={{ display: 'none' }}
                      id="fileInput"
                      ref={fileInputRef}
                    />
                    {LANGUAGE_LIBRARY[global.language]["选择一张图片"]}
                  </Button>
                </div>
              </div>
              <div className={`flex items-center select ${structureType === 'Custom' ? 'mb-0' : 'mb-4'}`}>
                <Select.Root
                  value={structureType}
                  onValueChange={(val: string) => {
                    let tips = "";
                    switch (val) {
                      case "CO-STAR":
                        tips =
                          "新加坡Prompt大赛冠军框架,一键将简单任务拆解,分析,并生成结构化提示词。";
                        break;
                      case "CRISPE":
                        tips =
                          "根据LangGPT框架优化,将简单任务拆解成复杂的工作流,并生成结构化提示词。";
                        break;
                      case "DRAW":
                        tips =
                          "将用户输入的画面描述拆解为镜头、光线、主体、背景、风格和氛围六个要素，进行补充和完善，生成高质量的绘画提示词。";
                        break;
                      case "Meta Prompting":
                        tips =
                          "清华大学和上海AI实验室提出的提示词优化方法。";
                        break;
                      case "CoT":
                        tips =
                          "通过模拟解决问题的思考过程来提高模型生成内容的质量和相关性。";
                        break;
                      case "VARI":
                        tips =
                          "Google Deepmind最新研究，变分规划提升Prompt。";
                        break;
                      case "Q*":
                        tips =
                          "利用马尔可夫决策过程进行提示词优化。";
                        break;
                      case "RISE":
                        tips =
                          "卡内基梅隆大学最新研究，让提示词递归内省。";
                        break;
                      case "MicrOptimization":
                        tips =
                          "微软最新的研究，通过自动优化你的指令数据集来提升你的Prompt能力。";
                        break;
                      case "Custom":
                        tips =
                          "自定义提示词优化指令";
                        break;
                      case "O1-STYLE":
                        tips =
                          "模仿o1遵循结构化思考、分步推理、持续反思和调整策略的提示词";
                        break;
                      case "OpenAI":
                        tips =
                          "OpenAI官方开源的提示词优化方法";
                        break;
                      case "claude":
                        tips =
                          "Claude官方开源的提示词优化方法";
                        break;
                    }
                    if (content) {
                      setUpdInpContent("");
                    }
                    setTestContent("");
                    setPictureUrl("");
                    setTipsContent(tips);
                    setStructureType(val);
                    window.localStorage.setItem('structureType', val)
                    window.localStorage.setItem('structureTips', tips)
                  }}
                >
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Group>
                      <Select.Item value="CO-STAR">{LANGUAGE_LIBRARY[global.language]['CO-STAR结构']}</Select.Item>
                      <Select.Item value="CRISPE">{LANGUAGE_LIBRARY[global.language]['CRISPE结构']}</Select.Item>
                      <Select.Item value="DRAW">{LANGUAGE_LIBRARY[global.language]['AI绘画提示词']}</Select.Item>
                      <Select.Item value="Meta Prompting">{LANGUAGE_LIBRARY[global.language]['Meta Prompting']}</Select.Item>
                      <Select.Item value="CoT">{LANGUAGE_LIBRARY[global.language]['CoT思维链']}</Select.Item>
                      <Select.Item value="VARI">{LANGUAGE_LIBRARY[global.language]['变分法']}</Select.Item>
                      <Select.Item value="Q*">{LANGUAGE_LIBRARY[global.language]['Q*']}</Select.Item>
                      <Select.Item value="RISE">{LANGUAGE_LIBRARY[global.language]['RISE']}</Select.Item>
                      <Select.Item value="O1-STYLE">{LANGUAGE_LIBRARY[global.language]['o1-style']}</Select.Item>
                      <Select.Item value="MicrOptimization">{LANGUAGE_LIBRARY[global.language]['微软优化法']}</Select.Item>
                      <Select.Item value="OpenAI">{LANGUAGE_LIBRARY[global.language]['OpenAI优化法']}</Select.Item>
                      <Select.Item value="claude">{LANGUAGE_LIBRARY[global.language]['Claude优化法']}</Select.Item>
                      <Select.Item value="Custom">{LANGUAGE_LIBRARY[global.language]['自定义']}</Select.Item>
                    </Select.Group>
                  </Select.Content>
                </Select.Root>
                <div className="tips">
                  {
                    // @ts-ignore
                    LANGUAGE_LIBRARY[global.language][tipsContent]
                  }
                </div>
              </div>
              {structureType === 'Custom' && onCustom()}
              <div>
                <CodeMirror
                  value={content}
                  height="500px"
                  extensions={[
                    markdown({ base: markdownLanguage, codeLanguages: languages }),
                    scrollBottom,
                    EditorView.lineWrapping,
                  ]}
                  onChange={(content) => {
                    setContent(content);
                  }}
                  className="code-mirror"
                  theme="dark"
                  basicSetup={{
                    lineNumbers: false,
                    foldGutter: false,
                    highlightActiveLine: false,
                  }}
                  editable={!(isDisabled || isUpd || isTesting)}
                />
              </div>
              <div className="sm:flex sm:justify-between">
                <Button
                  className=" px-9 mr-4"
                  onClick={onBack}
                  disabled={oldContent === "" ? true : false || isDisabled || isUpd || isTesting || !content}
                >
                  {LANGUAGE_LIBRARY[global.language]['回退']}
                </Button>
                <Input
                  enterKeyHint="search"
                  placeholder={LANGUAGE_LIBRARY[global.language]["请提出需要修改的点"]}
                  className="custom-input-style mr-4"
                  value={updInpContent}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUpdInpContent(val);
                  }}
                  onKeyDown={(e) => {
                    if (e.keyCode !== 13) {
                      return;
                    }
                    onUpdPromptFunc();
                  }}
                  disabled={isDisabled || isUpd || isTesting || !content}
                />
                <div className="flex mt-2 sm:mt-0">
                  <Button
                    className="bg-violet-500 hover:bg-violet-600 active:bg-violet-700 px-9 mr-4"
                    onClick={onUpdPromptFunc}
                    disabled={content === "" ? true : false || isDisabled || isUpd || isTesting}
                  >
                    <Spinner className="mr-2" loading={isUpd} />
                    {isUpd ? LANGUAGE_LIBRARY[global.language]["修改中..."] : LANGUAGE_LIBRARY[global.language]["修改"]}
                  </Button>
                  <Button
                    className="bg-green-700 hover:bg-green-600 active:bg-green-700 px-9 mr-4"
                    onClick={onCopyFunc}
                    disabled={content === "" ? true : false || isDisabled || isUpd || isTesting}
                  >
                    {LANGUAGE_LIBRARY[global.language]['复制']}
                  </Button>
                  <Button
                    className="bg-blue-500 hover:bg-blue-600 active:bg-blue-600 px-9"
                    onClick={onTestGeneratePromptFunc}
                    disabled={content === "" ? true : false || isDisabled || isUpd || isTesting}
                  >
                    <Spinner className="mr-2" loading={isTesting} />
                    {isTesting ? LANGUAGE_LIBRARY[global.language]["正在测试中，请耐心等待..."] : LANGUAGE_LIBRARY[global.language]["测试"]}
                  </Button>
                </div>
              </div>
              <div>
                {testContent && (
                  <CodeMirror
                    value={testContent}
                    extensions={[
                      markdown({
                        base: markdownLanguage,
                        codeLanguages: languages,
                      }),
                      scrollBottom,
                      EditorView.lineWrapping,
                    ]}
                    onChange={(content) => {
                      setTestContent(content);
                    }}
                    className="code-mirror"
                    theme="light"
                    basicSetup={{
                      lineNumbers: false,
                      foldGutter: false,
                      highlightActiveLine: false,
                    }}
                    editable={!(isDisabled || isUpd || isTesting)}
                  />
                )}
                {pictureUrl && (
                  <>
                    <div className="picture_container">
                      <img src={pictureUrl} />
                    </div>
                    <p className="text-xs mt-2 text-gray-500">{LANGUAGE_LIBRARY[global.language]['测试模型为']}Flux-Dev</p>
                  </>
                )}
              </div>
            </div>
          </div>
          <ToastContainer />
          {showBrand && <PoweredBy language={global.language} />}
        </div >
      ) : <PasswordVerification onVerified={() => {
        setIsVerified(true)
      }} />}
    </>
  );
}

export default App;
