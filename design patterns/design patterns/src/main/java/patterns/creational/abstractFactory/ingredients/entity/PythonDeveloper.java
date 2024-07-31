package patterns.creational.abstractFactory.ingredients.entity;

public class PythonDeveloper implements Developer{
    @Override
    public void getLanguage() {
        System.out.println("Python");
    }
}
