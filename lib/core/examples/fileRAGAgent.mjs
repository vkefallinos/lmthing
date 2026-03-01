export default async ({ defSystem, def, defData, $, defTool }) => {
  defSystem('role', "You are an LLM agent that is totally defined by the imported knowledge.")
  defFiles('knowledge', {knowledge: {
    programming: {
      languages: {
        javascript: {
          packages: {
            react: {
             _files: ['intro.md'] 
            }
          }
        }
      }
    }
  }})
  getDefaultCompilerOptions
  $`What programming languages do you know about? What packages do you know about? What files do you have knowledge of?`;



};